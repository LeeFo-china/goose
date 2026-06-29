import type {
  FinanceReconciliationDirection,
  FinanceReconciliationExceptionCode,
  FinanceReconciliationLevel,
} from "./finance-reconciliation-requests";

export type FinanceReconciliationQuery = {
  page?: number;
  pageSize?: number;
  date_from?: string;
  date_to?: string;
  project_id?: string;
  exception_code?: FinanceReconciliationExceptionCode | string;
  level?: FinanceReconciliationLevel | string;
  direction?: FinanceReconciliationDirection | string;
  status?: string;
};

export function buildFinanceReconciliationSearchParams(
  query: FinanceReconciliationQuery,
) {
  const params = new URLSearchParams({
    page: String(normalizePage(query.page)),
    pageSize: String(normalizePageSize(query.pageSize)),
  });
  appendOptionalParam(params, "date_from", query.date_from);
  appendOptionalParam(params, "date_to", query.date_to);
  appendOptionalParam(params, "project_id", query.project_id);
  appendOptionalParam(params, "exception_code", query.exception_code);
  appendOptionalParam(params, "level", query.level);
  appendOptionalParam(params, "direction", query.direction);
  appendOptionalParam(params, "status", query.status);
  return params;
}

export function financeReconciliationLevelMeta(
  level: FinanceReconciliationLevel | string | null | undefined,
) {
  if (level === "danger") {
    return { label: "高风险", variant: "danger" as const };
  }
  if (level === "warning") {
    return { label: "预警", variant: "secondary" as const };
  }
  return { label: "提示", variant: "outline" as const };
}

export function financeReconciliationDirectionLabel(
  direction: FinanceReconciliationDirection | string | null | undefined,
) {
  if (direction === "receivable") return "应收";
  if (direction === "payment") return "收款";
  if (direction === "expense") return "费用";
  if (direction === "ledger") return "台账";
  return direction || "-";
}

export function financeReconciliationExceptionLabel(
  code: FinanceReconciliationExceptionCode | string | null | undefined,
) {
  if (code === "receivable_overdue") return "应收逾期";
  if (code === "payment_without_ledger") return "收款未入账";
  if (code === "ledger_without_payment") return "流水缺收款关联";
  if (code === "payment_unallocated") return "收款未核销";
  if (code === "allocation_amount_mismatch") return "核销金额不一致";
  if (code === "receivable_paid_amount_mismatch") {
    return "应收已收不一致";
  }
  return code || "-";
}

export function financeReconciliationActionHref(value: string | null | undefined) {
  if (!value) return "/finance/reconciliation";
  return value.startsWith("/") ? value : "/finance/reconciliation";
}

function normalizePage(value: number | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizePageSize(value: number | undefined) {
  const pageSize = Number(value || 20);
  if (!Number.isFinite(pageSize) || pageSize <= 0) return 20;
  return Math.min(Math.floor(pageSize), 100);
}

function appendOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}
