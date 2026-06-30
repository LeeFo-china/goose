import { Errors } from "@/errors/error-factory";
import {
  financeClosingPeriodRepository,
  type FinanceClosingPeriodRow,
} from "@/repositories/finance-closing-periods";
import {
  financeMonthlyDifferenceSourcesRepository,
  type FinanceMonthlyDifferenceSourceListInput,
  type FinanceMonthlyDifferenceSourceRecord,
} from "@/repositories/finance-monthly-difference-sources";
import {
  financeMonthlyDifferenceResolutionsRepository,
  type FinanceMonthlyDifferenceResolutionRecord,
  type FinanceMonthlyDifferenceResolutionSourceKey,
} from "@/repositories/finance-monthly-difference-resolutions";
import type {
  FinanceMonthlyDifferenceResolutionStatus,
  FinanceMonthlyOverviewDifferenceSourcesQuery,
  FinanceMonthlyOverviewDifferenceSourceType,
  UpdateFinanceMonthlyDifferenceResolutionInput,
} from "@/schema/finance-reports";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  financeMonthlyOverviewService,
} from "@/services/finance-monthly-overview";

type Dependencies = {
  repository: Pick<
    typeof financeMonthlyDifferenceSourcesRepository,
    | "listCorrectionAuditSources"
    | "listLedgerEntrySources"
    | "listReceivablePlanSources"
    | "listExpenseRequestSources"
  >;
  closingPeriodRepository: Pick<
    typeof financeClosingPeriodRepository,
    "findByMonth"
  >;
  monthlyOverviewService: Pick<
    typeof financeMonthlyOverviewService,
    "getMonthlyOverview"
  >;
  resolutionRepository: Pick<
    typeof financeMonthlyDifferenceResolutionsRepository,
    "listBySources" | "upsert"
  >;
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission"
  >;
};

export type FinanceMonthlyDifferenceSourceResolution = {
  status: FinanceMonthlyDifferenceResolutionStatus;
  note: string | null;
  handled_by: string | null;
  handled_by_name: string | null;
  handled_at: string | null;
};

export type FinanceMonthlyDifferenceSourceWithResolution =
  FinanceMonthlyDifferenceSourceRecord & {
    resolution: FinanceMonthlyDifferenceSourceResolution;
  };

export type FinanceMonthlyDifferenceSourcesResult = {
  list: FinanceMonthlyDifferenceSourceWithResolution[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    month: string;
    closing_status: "not_started" | FinanceClosingPeriodRow["status"];
    baseline_at: string | null;
    has_snapshot_difference: boolean;
    total: number;
    by_source_type: Partial<
      Record<FinanceMonthlyOverviewDifferenceSourceType, number>
    >;
    resolution: Record<FinanceMonthlyDifferenceResolutionStatus, number>;
  };
};

const ALL_SOURCE_TYPES: FinanceMonthlyOverviewDifferenceSourceType[] = [
  "correction_audit",
  "ledger_entry",
  "receivable_plan",
  "expense_request",
];

export class FinanceMonthlyDifferenceSourcesService {
  constructor(
    private readonly dependencies: Dependencies = {
      repository: financeMonthlyDifferenceSourcesRepository,
      closingPeriodRepository: financeClosingPeriodRepository,
      monthlyOverviewService: financeMonthlyOverviewService,
      resolutionRepository: financeMonthlyDifferenceResolutionsRepository,
      accessPolicyService,
    },
  ) {}

  async listDifferenceSources(
    authContext: AuthContext,
    query: FinanceMonthlyOverviewDifferenceSourcesQuery,
  ): Promise<FinanceMonthlyDifferenceSourcesResult> {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanReadReports(authContext);

    const range = resolveMonthRange(query.month);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const closingPeriod = await this.dependencies.closingPeriodRepository
      .findByMonth({
        tenantId,
        periodMonth: range.month,
      });
    if (!closingPeriod) {
      return emptyResult(range.month, page, pageSize);
    }

    const baselineAt = resolveBaselineAt(closingPeriod);
    const monthlyOverview = await this.dependencies.monthlyOverviewService
      .getMonthlyOverview(authContext, { month: range.month });
    const sourceTypes = query.source_type
      ? [query.source_type]
      : ALL_SOURCE_TYPES;
    const candidateLimit = query.resolution_status
      ? Math.max(page * pageSize, 100)
      : page * pageSize;
    const requestInput: FinanceMonthlyDifferenceSourceListInput = {
      tenantId,
      month: range.month,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      baselineAt,
      projectId: query.project_id,
      candidateLimit,
    };
    const results = await Promise.all(
      sourceTypes.map(async (sourceType) => ({
        sourceType,
        ...await this.listSourceType(sourceType, requestInput),
      })),
    );
    const list = results
      .flatMap((result) => result.list)
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at));
    const resolutions = await this.dependencies.resolutionRepository
      .listBySources({
        tenantId,
        month: range.month,
        sources: list.map((record) => ({
          sourceType: record.source_type,
          sourceId: record.source_id,
        })),
      });
    const hydratedList = applyResolutionFilter(
      hydrateResolutions(list, resolutions),
      query.resolution_status,
    );
    const sourceTotal = results.reduce((sum, result) => sum + result.total, 0);
    const total = query.resolution_status ? hydratedList.length : sourceTotal;
    const from = (page - 1) * pageSize;

    return {
      list: hydratedList.slice(from, from + pageSize),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
      summary: {
        month: range.month,
        closing_status: closingPeriod.status,
        baseline_at: baselineAt,
        has_snapshot_difference:
          monthlyOverview.closing.has_snapshot_difference,
        total,
        by_source_type: buildSourceTypeSummary(results),
        resolution: buildResolutionSummary(
          hydrateResolutions(list, resolutions),
        ),
      },
    };
  }

  async updateResolution(
    authContext: AuthContext,
    input: UpdateFinanceMonthlyDifferenceResolutionInput,
  ): Promise<FinanceMonthlyDifferenceResolutionRecord> {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanManageResolutions(authContext);

    return this.dependencies.resolutionRepository.upsert({
      tenantId,
      month: input.month,
      sourceType: input.source_type,
      sourceId: input.source_id,
      projectId: input.project_id ?? null,
      status: input.status,
      note: normalizeOptionalText(input.note),
      handledBy: authContext.employeeId ?? null,
    });
  }

  private async listSourceType(
    sourceType: FinanceMonthlyOverviewDifferenceSourceType,
    input: FinanceMonthlyDifferenceSourceListInput,
  ) {
    if (sourceType === "correction_audit") {
      return this.dependencies.repository.listCorrectionAuditSources(input);
    }
    if (sourceType === "ledger_entry") {
      return this.dependencies.repository.listLedgerEntrySources(input);
    }
    if (sourceType === "receivable_plan") {
      return this.dependencies.repository.listReceivablePlanSources(input);
    }
    return this.dependencies.repository.listExpenseRequestSources(input);
  }

  private assertCanReadReports(authContext: AuthContext) {
    const allowed = [
      "finance.reports.read",
      "finance.view",
      "finance.ledger.view",
      "finance.dashboard.view",
    ].some((permission) =>
      this.dependencies.accessPolicyService.hasPermission(
        authContext,
        permission,
      )
    );

    if (!allowed) {
      throw Errors.forbidden();
    }
  }

  private assertCanManageResolutions(authContext: AuthContext) {
    if (
      !this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.closing.manage",
      )
    ) {
      throw Errors.forbidden();
    }
  }
}

function emptyResult(
  month: string,
  page: number,
  pageSize: number,
): FinanceMonthlyDifferenceSourcesResult {
  return {
    list: [],
    pagination: {
      page,
      pageSize,
      total: 0,
      totalPages: 0,
    },
    summary: {
      month,
      closing_status: "not_started",
      baseline_at: null,
      has_snapshot_difference: false,
      total: 0,
      by_source_type: {},
      resolution: {
        pending: 0,
        confirmed: 0,
        ignored: 0,
        resolved: 0,
      },
    },
  };
}

function buildSourceTypeSummary(
  results: Array<{
    sourceType: FinanceMonthlyOverviewDifferenceSourceType;
    list: FinanceMonthlyDifferenceSourceRecord[];
    total: number;
  }>,
) {
  return results.reduce<
    Partial<Record<FinanceMonthlyOverviewDifferenceSourceType, number>>
  >((summary, result) => {
    if (result.total > 0) summary[result.sourceType] = result.total;
    return summary;
  }, {});
}

function hydrateResolutions(
  list: FinanceMonthlyDifferenceSourceRecord[],
  resolutions: FinanceMonthlyDifferenceResolutionRecord[],
): FinanceMonthlyDifferenceSourceWithResolution[] {
  const resolutionMap = new Map(
    resolutions.map((resolution) => [
      sourceKey(resolution.source_type, resolution.source_id),
      resolution,
    ]),
  );

  return list.map((record) => {
    const resolution = resolutionMap.get(
      sourceKey(record.source_type, record.source_id),
    );
    return {
      ...record,
      resolution: resolution
        ? {
          status: resolution.status,
          note: resolution.note,
          handled_by: resolution.handled_by,
          handled_by_name: resolution.handled_by_name,
          handled_at: resolution.handled_at,
        }
        : pendingResolution(),
    };
  });
}

function applyResolutionFilter(
  list: FinanceMonthlyDifferenceSourceWithResolution[],
  status: FinanceMonthlyDifferenceResolutionStatus | undefined,
) {
  if (!status) return list;
  return list.filter((record) => record.resolution.status === status);
}

function buildResolutionSummary(
  list: FinanceMonthlyDifferenceSourceWithResolution[],
): Record<FinanceMonthlyDifferenceResolutionStatus, number> {
  return list.reduce<Record<FinanceMonthlyDifferenceResolutionStatus, number>>(
    (summary, record) => {
      summary[record.resolution.status] += 1;
      return summary;
    },
    {
      pending: 0,
      confirmed: 0,
      ignored: 0,
      resolved: 0,
    },
  );
}

function pendingResolution(): FinanceMonthlyDifferenceSourceResolution {
  return {
    status: "pending",
    note: null,
    handled_by: null,
    handled_by_name: null,
    handled_at: null,
  };
}

function sourceKey(
  sourceType: FinanceMonthlyOverviewDifferenceSourceType,
  sourceId: string,
) {
  return `${sourceType}:${sourceId}`;
}

function normalizeOptionalText(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function resolveBaselineAt(closingPeriod: FinanceClosingPeriodRow) {
  return closingPeriod.closed_at ?? closingPeriod.updated_at;
}

function resolveMonthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw Errors.badRequest("月份格式必须为 YYYY-MM");
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw Errors.badRequest("月份格式必须为 YYYY-MM");
  }

  const dateFrom = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0))
    .toISOString()
    .slice(0, 10);
  return { month, dateFrom, dateTo: lastDay };
}

export const financeMonthlyDifferenceSourcesService =
  new FinanceMonthlyDifferenceSourcesService();
