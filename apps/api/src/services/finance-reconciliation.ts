import { Errors } from "@/errors/error-factory";
import {
  financeReconciliationActionsRepository,
  type FinanceReconciliationActionRecord,
} from "@/repositories/finance-reconciliation-actions";
import {
  financeReconciliationRepository,
  type FinanceReconciliationProjectTotals,
} from "@/repositories/finance-reconciliation";
import type {
  CreateFinanceReconciliationExceptionAction,
  FinanceReconciliationAction,
  FinanceReconciliationExceptionCode,
  FinanceReconciliationExceptionActionListQuery,
  FinanceReconciliationExceptionListQuery,
  FinanceReconciliationLevel,
  FinanceReconciliationOperatingStatsQuery,
  FinanceReconciliationStatus,
} from "@/schema/finance-reconciliation";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  buildFinanceReconciliationOperatingStats,
  type FinanceReconciliationOperatingStats,
} from "@/services/finance-reconciliation-operating-stats";
import {
  buildFinanceReconciliationExceptions,
  type FinanceReconciliationException,
} from "@/services/finance-reconciliation-exceptions";

const MAX_RECONCILIATION_RANGE_DAYS = 366;
const DEFAULT_RECONCILIATION_RANGE_DAYS = 30;
const MONEY_TOLERANCE = 0.009;

type FinanceReconciliationFilterQuery = {
  date_from?: string;
  date_to?: string;
  project_id?: string;
  exception_code?: FinanceReconciliationExceptionCode;
  level?: FinanceReconciliationLevel;
  direction?: FinanceReconciliationExceptionListQuery["direction"];
  status?: FinanceReconciliationStatus;
  actor_employee_id?: string;
};

type FinanceReconciliationServiceDependencies = {
  repository: Pick<
    typeof financeReconciliationRepository,
    "listCandidateRows" | "getProjectSummaryTotals"
  >;
  actionsRepository: Pick<
    typeof financeReconciliationActionsRepository,
    "listLatestActions" | "listActions" | "createAction"
  >;
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission" | "canAccessProject"
  >;
  now?: () => Date;
};

export type FinanceReconciliationProjectSummary =
  FinanceReconciliationProjectTotals & {
    income_ledger_consistent: boolean;
    payment_allocation_consistent: boolean;
    expense_ledger_consistent: boolean;
    exception_count: number;
    danger_count: number;
    warning_count: number;
    open_exception_count: number;
    acknowledged_exception_count: number;
    ignored_exception_count: number;
    resolved_exception_count: number;
    latest_exception_at: string | null;
    latest_exception_code: FinanceReconciliationExceptionCode | null;
    latest_exception_title: string | null;
    highest_exception_level: FinanceReconciliationLevel | null;
    latest_action_at: string | null;
    latest_action_remark: string | null;
    latest_actor_employee_name: string | null;
  };

export class FinanceReconciliationService {
  constructor(
    private readonly dependencies: FinanceReconciliationServiceDependencies = {
      repository: financeReconciliationRepository,
      actionsRepository: financeReconciliationActionsRepository,
      accessPolicyService,
      now: () => new Date(),
    },
  ) {}

  async listExceptions(
    authContext: AuthContext,
    query: FinanceReconciliationExceptionListQuery,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanViewReconciliation(authContext);

    const range = this.resolveDateRange(query);

    const candidates = await this.dependencies.repository.listCandidateRows({
      tenantId,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      projectId: query.project_id,
    });
    const exceptionsWithActions = await withActionState({
      tenantId,
      exceptions: buildFinanceReconciliationExceptions(candidates, range.dateTo),
      actionsRepository: this.dependencies.actionsRepository,
    });
    const exceptions = this.filterExceptions(
      exceptionsWithActions,
      query,
    );

    return buildListResponse(exceptions, query);
  }

  async getOperatingStats(
    authContext: AuthContext,
    query: FinanceReconciliationOperatingStatsQuery,
  ): Promise<FinanceReconciliationOperatingStats> {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanViewReconciliation(authContext);

    const range = this.resolveDateRange(query);
    const candidates = await this.dependencies.repository.listCandidateRows({
      tenantId,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      projectId: query.project_id,
    });
    const exceptionsWithActions = await withActionState({
      tenantId,
      exceptions: buildFinanceReconciliationExceptions(candidates, range.dateTo),
      actionsRepository: this.dependencies.actionsRepository,
    });
    const exceptions = this.filterExceptions(exceptionsWithActions, query);

    return buildFinanceReconciliationOperatingStats(exceptions, range);
  }

  async getProjectSummary(
    authContext: AuthContext,
    projectId: string,
  ): Promise<FinanceReconciliationProjectSummary> {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    const totals = await this.dependencies.repository.getProjectSummaryTotals({
      tenantId,
      projectId,
    });
    if (!totals) {
      throw Errors.forbidden();
    }

    if (!this.canViewReconciliation(authContext)) {
      const canAccessProject = await this.dependencies.accessPolicyService
        .canAccessProject(authContext, projectId, "project.read");
      if (!canAccessProject) {
        throw Errors.forbidden();
      }
    }

    const dateTo = toDateOnly(this.dependencies.now?.() ?? new Date());
    const candidates = await this.dependencies.repository.listCandidateRows({
      tenantId,
      projectId,
      dateFrom: "1970-01-01",
      dateTo,
    });
    const exceptions = await withActionState({
      tenantId,
      exceptions: buildFinanceReconciliationExceptions(candidates, dateTo),
      actionsRepository: this.dependencies.actionsRepository,
    });
    const latestAction = latestActionFromExceptions(exceptions);
    const latestException = exceptions[0] ?? null;
    const highestExceptionLevel = highestLevelFromExceptions(
      exceptions.filter((item) =>
        item.status !== "ignored" && item.status !== "resolved"
      ),
    );

    return {
      ...totals,
      income_ledger_consistent: moneyEquals(
        totals.received_amount,
        totals.ledger_income_amount,
      ),
      payment_allocation_consistent: moneyEquals(
        totals.received_amount,
        totals.allocated_amount,
      ),
      expense_ledger_consistent: moneyEquals(
        totals.expense_paid_amount,
        totals.ledger_expense_amount,
      ),
      exception_count: exceptions.length,
      danger_count: exceptions.filter((item) => item.level === "danger").length,
      warning_count: exceptions.filter((item) => item.level === "warning").length,
      open_exception_count: exceptions.filter((item) => item.status === "open").length,
      acknowledged_exception_count: exceptions.filter((item) =>
        item.status === "acknowledged"
      ).length,
      ignored_exception_count: exceptions.filter((item) => item.status === "ignored")
        .length,
      resolved_exception_count: exceptions.filter((item) => item.status === "resolved")
        .length,
      latest_exception_at: latestException?.occurred_at ?? null,
      latest_exception_code: latestException?.exception_code ?? null,
      latest_exception_title: latestException?.title ?? null,
      highest_exception_level: highestExceptionLevel,
      latest_action_at: latestAction?.last_action_at ?? null,
      latest_action_remark: latestAction?.last_action_remark ?? null,
      latest_actor_employee_name: latestAction?.last_actor_employee_name ?? null,
    };
  }

  async createExceptionAction(
    authContext: AuthContext,
    fingerprint: string,
    input: CreateFinanceReconciliationExceptionAction,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanManageReconciliation(authContext);

    const dateTo = toDateOnly(this.dependencies.now?.() ?? new Date());
    const candidates = await this.dependencies.repository.listCandidateRows({
      tenantId,
      dateFrom: "1970-01-01",
      dateTo,
    });
    const target = buildFinanceReconciliationExceptions(candidates, dateTo)
      .find((item) => item.exception_fingerprint === fingerprint);
    if (!target) {
      throw Errors.notFound("对账异常不存在或已消失");
    }

    return this.dependencies.actionsRepository.createAction({
      tenantId,
      exceptionFingerprint: target.exception_fingerprint,
      exceptionCode: target.exception_code,
      subjectType: target.subject_type,
      subjectId: target.subject_id,
      projectId: target.project_id,
      action: input.action,
      remark: input.remark,
      actorEmployeeId: authContext.employeeId ?? null,
    });
  }

  async listExceptionActions(
    authContext: AuthContext,
    fingerprint: string,
    query: FinanceReconciliationExceptionActionListQuery,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanViewReconciliation(authContext);

    return this.dependencies.actionsRepository.listActions({
      tenantId,
      exceptionFingerprint: fingerprint,
      page: query.page ?? 1,
      pageSize: Math.min(query.pageSize ?? 20, 100),
    });
  }

  private filterExceptions(
    exceptions: FinanceReconciliationException[],
    query: FinanceReconciliationFilterQuery,
  ) {
    return exceptions.filter((item) =>
      (!query.exception_code || item.exception_code === query.exception_code) &&
      (!query.level || item.level === query.level) &&
      (!query.direction || item.direction === query.direction) &&
      (!query.project_id || item.project_id === query.project_id) &&
      (!query.status || item.status === query.status) &&
      (!query.actor_employee_id ||
        item.last_actor_employee_id === query.actor_employee_id)
    );
  }

  private resolveDateRange(query: FinanceReconciliationFilterQuery) {
    const dateTo = query.date_to ??
      toDateOnly(this.dependencies.now?.() ?? new Date());
    const dateFrom = query.date_from ??
      shiftDate(dateTo, -DEFAULT_RECONCILIATION_RANGE_DAYS + 1);
    const fromTime = Date.parse(`${dateFrom}T00:00:00.000Z`);
    const toTime = Date.parse(`${dateTo}T00:00:00.000Z`);
    if (
      !Number.isFinite(fromTime) ||
      !Number.isFinite(toTime) ||
      fromTime > toTime
    ) {
      throw Errors.badRequest("对账日期范围无效");
    }

    const rangeDays = Math.floor((toTime - fromTime) / 86_400_000) + 1;
    if (rangeDays > MAX_RECONCILIATION_RANGE_DAYS) {
      throw Errors.badRequest("对账日期范围不能超过 366 天");
    }

    return { dateFrom, dateTo };
  }

  private assertCanViewReconciliation(authContext: AuthContext) {
    if (!this.canViewReconciliation(authContext)) {
      throw Errors.forbidden();
    }
  }

  private assertCanManageReconciliation(authContext: AuthContext) {
    if (
      !this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.reconciliation.manage",
      )
    ) {
      throw Errors.forbidden();
    }
  }

  private canViewReconciliation(authContext: AuthContext) {
    return [
      "finance.view",
      "finance.ledger.view",
      "finance.receivable.view",
      "finance.receivable.manage",
    ].some((permission) =>
      this.dependencies.accessPolicyService.hasPermission(
        authContext,
        permission,
      )
    );
  }
}

async function withActionState(input: {
  tenantId: string;
  exceptions: FinanceReconciliationException[];
  actionsRepository: Pick<
    typeof financeReconciliationActionsRepository,
    "listLatestActions"
  >;
}) {
  const actionMap = await input.actionsRepository.listLatestActions({
    tenantId: input.tenantId,
    fingerprints: input.exceptions.map((item) => item.exception_fingerprint),
  });

  return input.exceptions.map((item) =>
    applyActionState(item, actionMap.get(item.exception_fingerprint) ?? null)
  );
}

function applyActionState(
  item: FinanceReconciliationException,
  action: FinanceReconciliationActionRecord | null,
): FinanceReconciliationException {
  if (!action) return item;
  return {
    ...item,
    status: statusFromAction(action.action),
    last_action: action.action,
    last_action_at: action.created_at,
    last_action_remark: action.remark,
    last_actor_employee_id: action.actor_employee_id,
    last_actor_employee_name: action.actor_employee_name,
  };
}

function statusFromAction(action: FinanceReconciliationAction) {
  if (action === "acknowledge") return "acknowledged" as const;
  if (action === "ignore") return "ignored" as const;
  if (action === "resolve") return "resolved" as const;
  return "open" as const;
}

function latestActionFromExceptions(exceptions: FinanceReconciliationException[]) {
  return exceptions
    .filter((item) => item.last_action_at)
    .sort((left, right) =>
      Date.parse(right.last_action_at || "") -
      Date.parse(left.last_action_at || "")
    )[0] ?? null;
}

function highestLevelFromExceptions(
  exceptions: FinanceReconciliationException[],
): FinanceReconciliationLevel | null {
  if (exceptions.some((item) => item.level === "danger")) return "danger";
  if (exceptions.some((item) => item.level === "warning")) return "warning";
  if (exceptions.some((item) => item.level === "info")) return "info";
  return null;
}

function buildListResponse(
  exceptions: FinanceReconciliationException[],
  query: FinanceReconciliationExceptionListQuery,
) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const from = (page - 1) * pageSize;
  const list = exceptions.slice(from, from + pageSize);

  return {
    list,
    pagination: {
      page,
      pageSize,
      total: exceptions.length,
      totalPages: exceptions.length ? Math.ceil(exceptions.length / pageSize) : 0,
    },
    summary: summarize(exceptions),
  };
}

function summarize(exceptions: FinanceReconciliationException[]) {
  return exceptions.reduce(
    (summary, item) => {
      summary.total += 1;
      summary[item.level] += 1;
      return summary;
    },
    { total: 0, danger: 0, warning: 0, info: 0 },
  );
}

function moneyEquals(left: number, right: number) {
  return Math.abs(left - right) <= MONEY_TOLERANCE;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return toDateOnly(value);
}

export const financeReconciliationService =
  new FinanceReconciliationService();
