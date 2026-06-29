import { Errors } from "@/errors/error-factory";
import {
  financeReconciliationRepository,
  type FinanceReconciliationCandidateRows,
  type FinanceReconciliationLedgerRow,
  type FinanceReconciliationPaymentRow,
  type FinanceReconciliationReceivableRow,
} from "@/repositories/finance-reconciliation";
import type {
  FinanceReconciliationDirection,
  FinanceReconciliationExceptionCode,
  FinanceReconciliationExceptionListQuery,
  FinanceReconciliationLevel,
} from "@/schema/finance-reconciliation";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const MAX_RECONCILIATION_RANGE_DAYS = 366;
const DEFAULT_RECONCILIATION_RANGE_DAYS = 30;
const MONEY_TOLERANCE = 0.009;

type FinanceReconciliationServiceDependencies = {
  repository: Pick<
    typeof financeReconciliationRepository,
    "listCandidateRows"
  >;
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission"
  >;
  now?: () => Date;
};

export type FinanceReconciliationException = {
  id: string;
  project_id: string | null;
  project_name: string | null;
  exception_code: FinanceReconciliationExceptionCode;
  level: FinanceReconciliationLevel;
  direction: FinanceReconciliationDirection;
  status: "open";
  title: string;
  description: string;
  amount: number;
  occurred_at: string;
  action: {
    key: string;
    label: string;
    target: string;
  };
};

export class FinanceReconciliationService {
  constructor(
    private readonly dependencies: FinanceReconciliationServiceDependencies = {
      repository: financeReconciliationRepository,
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
    if (query.status === "resolved") {
      return buildListResponse([], query);
    }

    const candidates = await this.dependencies.repository.listCandidateRows({
      tenantId,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      projectId: query.project_id,
    });
    const exceptions = this.filterExceptions(
      this.buildExceptions(candidates, range.dateTo),
      query,
    );

    return buildListResponse(exceptions, query);
  }

  private buildExceptions(
    candidates: FinanceReconciliationCandidateRows,
    tenantToday: string,
  ): FinanceReconciliationException[] {
    return [
      ...candidates.receivables.flatMap((row) =>
        this.buildReceivableExceptions(row, tenantToday)
      ),
      ...candidates.payments.flatMap((row) =>
        this.buildPaymentExceptions(row)
      ),
      ...candidates.ledgers.flatMap((row) => this.buildLedgerExceptions(row)),
    ].sort(compareExceptions);
  }

  private buildReceivableExceptions(
    row: FinanceReconciliationReceivableRow,
    tenantToday: string,
  ): FinanceReconciliationException[] {
    const exceptions: FinanceReconciliationException[] = [];
    const remainingAmount = roundMoney(row.amount - row.paid_amount);
    const dueAt = toDateTime(row.due_date);

    if (
      row.status !== "paid" &&
      row.status !== "canceled" &&
      remainingAmount > MONEY_TOLERANCE &&
      row.due_date !== null &&
      row.due_date < tenantToday
    ) {
      exceptions.push({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        exception_code: "receivable_overdue",
        level: "warning",
        direction: "receivable",
        status: "open",
        title: "应收已逾期",
        description: `${row.title ?? "应收计划"}已到期未结清，剩余 ${formatMoney(remainingAmount)}。`,
        amount: remainingAmount,
        occurred_at: dueAt,
        action: receivableAction(row.project_id),
      });
    }

    const paidDiff = roundMoney(
      Math.abs(row.paid_amount - row.allocation_amount),
    );
    if (
      paidDiff > MONEY_TOLERANCE &&
      (row.paid_amount > MONEY_TOLERANCE ||
        row.allocation_amount > MONEY_TOLERANCE)
    ) {
      exceptions.push({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        exception_code: "receivable_paid_amount_mismatch",
        level: "danger",
        direction: "receivable",
        status: "open",
        title: "应收已收金额与核销不一致",
        description:
          `应收已收 ${formatMoney(row.paid_amount)}，核销合计 ${formatMoney(row.allocation_amount)}。`,
        amount: paidDiff,
        occurred_at: dueAt,
        action: receivableAction(row.project_id),
      });
    }

    return exceptions;
  }

  private buildPaymentExceptions(
    row: FinanceReconciliationPaymentRow,
  ): FinanceReconciliationException[] {
    const exceptions: FinanceReconciliationException[] = [];
    const occurredAt = row.pay_date ?? row.created_at ?? new Date(0).toISOString();
    const projectId = row.project_id;

    if (row.amount > MONEY_TOLERANCE && row.ledger_amount <= MONEY_TOLERANCE) {
      exceptions.push({
        id: row.id,
        project_id: projectId,
        project_name: row.project_name,
        exception_code: "payment_without_ledger",
        level: "danger",
        direction: "payment",
        status: "open",
        title: "确认收款未入账",
        description:
          `收款 ${formatMoney(row.amount)} 已确认，但未找到对应项目收款入账流水。`,
        amount: row.amount,
        occurred_at: occurredAt,
        action: receivableAction(projectId),
      });
    }

    const unallocatedAmount = roundMoney(row.amount - row.allocation_amount);
    if (unallocatedAmount > MONEY_TOLERANCE) {
      exceptions.push({
        id: row.id,
        project_id: projectId,
        project_name: row.project_name,
        exception_code: "payment_unallocated",
        level: "warning",
        direction: "payment",
        status: "open",
        title: "收款未完全核销",
        description:
          `收款 ${formatMoney(row.amount)}，已核销 ${formatMoney(row.allocation_amount)}。`,
        amount: unallocatedAmount,
        occurred_at: occurredAt,
        action: receivableAction(projectId),
      });
    }

    const overAllocatedAmount = roundMoney(row.allocation_amount - row.amount);
    if (overAllocatedAmount > MONEY_TOLERANCE) {
      exceptions.push({
        id: row.id,
        project_id: projectId,
        project_name: row.project_name,
        exception_code: "allocation_amount_mismatch",
        level: "danger",
        direction: "payment",
        status: "open",
        title: "核销金额超过收款金额",
        description:
          `收款 ${formatMoney(row.amount)}，核销合计 ${formatMoney(row.allocation_amount)}。`,
        amount: overAllocatedAmount,
        occurred_at: occurredAt,
        action: receivableAction(projectId),
      });
    }

    return exceptions;
  }

  private buildLedgerExceptions(
    row: FinanceReconciliationLedgerRow,
  ): FinanceReconciliationException[] {
    if (row.payment_id) {
      return [];
    }

    return [{
      id: row.id,
      project_id: row.project_id,
      project_name: row.project_name,
      exception_code: "ledger_without_payment",
      level: "warning",
      direction: "ledger",
      status: "open",
      title: "项目收款流水缺少收款关联",
      description:
        `项目收款流水 ${formatMoney(row.amount)} 缺少 payment 关联。`,
      amount: row.amount,
      occurred_at: row.occurred_at ?? new Date(0).toISOString(),
      action: ledgerAction(row.project_id),
    }];
  }

  private filterExceptions(
    exceptions: FinanceReconciliationException[],
    query: FinanceReconciliationExceptionListQuery,
  ) {
    return exceptions.filter((item) =>
      (!query.exception_code || item.exception_code === query.exception_code) &&
      (!query.level || item.level === query.level) &&
      (!query.direction || item.direction === query.direction) &&
      (!query.project_id || item.project_id === query.project_id)
    );
  }

  private resolveDateRange(query: FinanceReconciliationExceptionListQuery) {
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
    const allowed = [
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

    if (!allowed) {
      throw Errors.forbidden();
    }
  }
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

function compareExceptions(
  left: FinanceReconciliationException,
  right: FinanceReconciliationException,
) {
  return Date.parse(right.occurred_at) - Date.parse(left.occurred_at) ||
    left.exception_code.localeCompare(right.exception_code) ||
    left.id.localeCompare(right.id);
}

function receivableAction(projectId: string | null) {
  return {
    key: "open_payment",
    label: "查看应收",
    target: projectId
      ? `/finance/receivables?project_id=${projectId}`
      : "/finance/receivables",
  };
}

function ledgerAction(projectId: string | null) {
  return {
    key: "open_ledger",
    label: "查看台账",
    target: projectId
      ? `/finance/ledger?project_id=${projectId}&direction=in`
      : "/finance/ledger?direction=in",
  };
}

function toDateTime(date: string | null) {
  return date ? `${date}T00:00:00.000Z` : new Date(0).toISOString();
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return toDateOnly(value);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number) {
  return `¥${roundMoney(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const financeReconciliationService =
  new FinanceReconciliationService();
