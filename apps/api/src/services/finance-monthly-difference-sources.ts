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
import type {
  FinanceMonthlyOverviewDifferenceSourcesQuery,
  FinanceMonthlyOverviewDifferenceSourceType,
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
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission"
  >;
};

export type FinanceMonthlyDifferenceSourcesResult = {
  list: FinanceMonthlyDifferenceSourceRecord[];
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
    const candidateLimit = page * pageSize;
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
    const total = results.reduce((sum, result) => sum + result.total, 0);
    const from = (page - 1) * pageSize;

    return {
      list: list.slice(from, from + pageSize),
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
      },
    };
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
