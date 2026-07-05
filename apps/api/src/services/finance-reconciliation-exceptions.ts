import type {
  FinanceReconciliationSubjectType,
} from "@/repositories/finance-reconciliation-actions";
import type {
  FinanceReconciliationCandidateRows,
  FinanceReconciliationExpenseLedgerRow,
  FinanceReconciliationExpenseSettlementRow,
  FinanceReconciliationLedgerRow,
  FinanceReconciliationPaymentRow,
  FinanceReconciliationReceivableRow,
} from "@/repositories/finance-reconciliation";
import type {
  FinanceReconciliationAction,
  FinanceReconciliationDirection,
  FinanceReconciliationExceptionCode,
  FinanceReconciliationLevel,
  FinanceReconciliationStatus,
} from "@/schema/finance-reconciliation";

const MONEY_TOLERANCE = 0.009;

export type FinanceReconciliationException = {
  id: string;
  project_id: string | null;
  project_name: string | null;
  exception_code: FinanceReconciliationExceptionCode;
  level: FinanceReconciliationLevel;
  direction: FinanceReconciliationDirection;
  status: FinanceReconciliationStatus;
  exception_fingerprint: string;
  subject_type: FinanceReconciliationSubjectType;
  subject_id: string | null;
  title: string;
  description: string;
  amount: number;
  occurred_at: string;
  action: {
    key: string;
    label: string;
    target: string;
  };
  last_action: FinanceReconciliationAction | null;
  last_action_at: string | null;
  last_action_remark: string | null;
  last_actor_employee_id: string | null;
  last_actor_employee_name: string | null;
};

export function buildFinanceReconciliationExceptions(
  candidates: FinanceReconciliationCandidateRows,
  tenantToday: string,
): FinanceReconciliationException[] {
  return [
    ...candidates.receivables.flatMap((row) =>
      buildReceivableExceptions(row, tenantToday)
    ),
    ...candidates.payments.flatMap((row) => buildPaymentExceptions(row)),
    ...candidates.ledgers.flatMap((row) => buildLedgerExceptions(row)),
    ...(candidates.expenseSettlements || []).flatMap((row) =>
      buildExpenseSettlementExceptions(row)
    ),
    ...(candidates.expenseLedgers || []).flatMap((row) =>
      buildExpenseLedgerExceptions(row)
    ),
  ].sort(compareExceptions);
}

function buildReceivableExceptions(
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
      ...baseException("receivable_overdue", "receivable", row.id),
      id: row.id,
      project_id: row.project_id,
      project_name: row.project_name,
      level: "warning",
      direction: "receivable",
      title: "应收已逾期",
      description: `${row.title ?? "应收计划"}已到期未结清，剩余 ${formatMoney(remainingAmount)}。`,
      amount: remainingAmount,
      occurred_at: dueAt,
      action: receivableAction(row.project_id, {
        status: "overdue",
        receivablePlanId: row.id,
        key: "open_receivable_overdue",
      }),
    });
  }

  const paidDiff = roundMoney(Math.abs(row.paid_amount - row.allocation_amount));
  if (
    paidDiff > MONEY_TOLERANCE &&
    (row.paid_amount > MONEY_TOLERANCE ||
      row.allocation_amount > MONEY_TOLERANCE)
  ) {
    exceptions.push({
      ...baseException(
        "receivable_paid_amount_mismatch",
        "receivable",
        row.id,
      ),
      id: row.id,
      project_id: row.project_id,
      project_name: row.project_name,
      level: "danger",
      direction: "receivable",
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

function buildPaymentExceptions(
  row: FinanceReconciliationPaymentRow,
): FinanceReconciliationException[] {
  const exceptions: FinanceReconciliationException[] = [];
  const occurredAt = row.pay_date ?? row.created_at ?? new Date(0).toISOString();
  const projectId = row.project_id;

  if (row.amount > MONEY_TOLERANCE && row.ledger_amount <= MONEY_TOLERANCE) {
    exceptions.push({
      ...baseException("payment_without_ledger", "payment", row.id),
      id: row.id,
      project_id: projectId,
      project_name: row.project_name,
      level: "danger",
      direction: "payment",
      title: "确认收款未入账",
      description:
        `收款 ${formatMoney(row.amount)} 已确认，但未找到对应项目收款入账流水。`,
      amount: row.amount,
      occurred_at: occurredAt,
      action: projectPaymentLedgerAction(projectId, row.id),
    });
  }

  const unallocatedAmount = roundMoney(row.amount - row.allocation_amount);
  if (unallocatedAmount > MONEY_TOLERANCE) {
    exceptions.push({
      ...baseException("payment_unallocated", "payment", row.id),
      id: row.id,
      project_id: projectId,
      project_name: row.project_name,
      level: "warning",
      direction: "payment",
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
      ...baseException("allocation_amount_mismatch", "payment", row.id),
      id: row.id,
      project_id: projectId,
      project_name: row.project_name,
      level: "danger",
      direction: "payment",
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

function buildLedgerExceptions(
  row: FinanceReconciliationLedgerRow,
): FinanceReconciliationException[] {
  if (row.payment_id) return [];

  return [{
    ...baseException("ledger_without_payment", "ledger", row.id),
    id: row.id,
    project_id: row.project_id,
    project_name: row.project_name,
    level: "warning",
    direction: "ledger",
    title: "项目收款流水缺少收款关联",
    description: `项目收款流水 ${formatMoney(row.amount)} 缺少 payment 关联。`,
    amount: row.amount,
    occurred_at: row.occurred_at ?? new Date(0).toISOString(),
    action: ledgerAction(row.project_id, row.id),
  }];
}

function buildExpenseSettlementExceptions(
  row: FinanceReconciliationExpenseSettlementRow,
): FinanceReconciliationException[] {
  const exceptions: FinanceReconciliationException[] = [];
  const occurredAt = row.paid_at ?? new Date(0).toISOString();

  if (row.paid_amount > MONEY_TOLERANCE && row.ledger_amount <= MONEY_TOLERANCE) {
    exceptions.push({
      ...baseException("expense_paid_without_ledger", "expense_settlement", row.id),
      id: row.id,
      project_id: row.project_id,
      project_name: row.project_name,
      level: "danger",
      direction: "expense",
      title: "费用已打款未入账",
      description:
        `费用${row.title ? `「${row.title}」` : ""}已打款 ${formatMoney(row.paid_amount)}，但未找到对应支出台账。`,
      amount: row.paid_amount,
      occurred_at: occurredAt,
      action: expenseLedgerAction({
        projectId: row.project_id,
        expenseRequestId: row.expense_request_id,
        expenseSettlementId: row.id,
      }),
    });
  }

  const ledgerDiff = roundMoney(Math.abs(row.paid_amount - row.ledger_amount));
  if (
    ledgerDiff > MONEY_TOLERANCE &&
    row.ledger_amount > MONEY_TOLERANCE
  ) {
    exceptions.push({
      ...baseException(
        "expense_paid_amount_mismatch",
        "expense_settlement",
        row.id,
      ),
      id: row.id,
      project_id: row.project_id,
      project_name: row.project_name,
      level: "danger",
      direction: "expense",
      title: "费用打款与支出台账金额不一致",
      description:
        `费用打款 ${formatMoney(row.paid_amount)}，支出台账合计 ${formatMoney(row.ledger_amount)}。`,
      amount: ledgerDiff,
      occurred_at: occurredAt,
      action: expenseLedgerAction({
        projectId: row.project_id,
        expenseRequestId: row.expense_request_id,
        expenseSettlementId: row.id,
      }),
    });
  }

  return exceptions;
}

function buildExpenseLedgerExceptions(
  row: FinanceReconciliationExpenseLedgerRow,
): FinanceReconciliationException[] {
  if (row.cost_category_id) return [];

  return [{
    ...baseException("expense_ledger_without_category", "ledger", row.id),
    id: row.id,
    project_id: row.project_id,
    project_name: row.project_name,
    level: "info",
    direction: "expense",
    title: "支出台账缺少成本分类",
    description: `支出台账 ${formatMoney(row.amount)} 未归集到成本分类。`,
    amount: row.amount,
    occurred_at: row.occurred_at ?? new Date(0).toISOString(),
    action: expenseLedgerAction({
      projectId: row.project_id,
      ledgerId: row.id,
      unallocatedOnly: true,
    }),
  }];
}

function baseException(
  code: FinanceReconciliationExceptionCode,
  subjectType: FinanceReconciliationSubjectType,
  subjectId: string,
) {
  return {
    exception_code: code,
    status: "open" as const,
    exception_fingerprint: `${code}:${subjectId}`,
    subject_type: subjectType,
    subject_id: subjectId,
    last_action: null,
    last_action_at: null,
    last_action_remark: null,
    last_actor_employee_id: null,
    last_actor_employee_name: null,
  };
}

function compareExceptions(
  left: FinanceReconciliationException,
  right: FinanceReconciliationException,
) {
  return Date.parse(right.occurred_at) - Date.parse(left.occurred_at) ||
    left.exception_code.localeCompare(right.exception_code) ||
    left.id.localeCompare(right.id);
}

function receivableAction(
  projectId: string | null,
  filters: {
    status?: string;
    receivablePlanId?: string;
    key?: string;
  } = {},
) {
  const params = new URLSearchParams();
  appendParam(params, "project_id", projectId);
  appendParam(params, "status", filters.status);
  appendParam(params, "receivable_plan_id", filters.receivablePlanId);
  return {
    key: filters.key ?? "open_receivables",
    label: "去处理",
    target: buildTarget("/finance/receivables", params),
  };
}

function ledgerAction(projectId: string | null, ledgerId: string) {
  const params = new URLSearchParams();
  appendParam(params, "project_id", projectId);
  params.set("direction", "in");
  params.set("entry_type", "project_payment");
  params.set("ledger_id", ledgerId);
  return {
    key: "open_ledger",
    label: "去处理",
    target: buildTarget("/finance/ledger", params),
  };
}

function projectPaymentLedgerAction(projectId: string | null, paymentId: string) {
  const params = new URLSearchParams();
  appendParam(params, "project_id", projectId);
  params.set("direction", "in");
  params.set("entry_type", "project_payment");
  params.set("payment_id", paymentId);
  return {
    key: "open_project_payment_ledger",
    label: "去处理",
    target: buildTarget("/finance/ledger", params),
  };
}

function expenseLedgerAction(input: {
  projectId: string | null;
  expenseRequestId?: string | null;
  expenseSettlementId?: string | null;
  ledgerId?: string | null;
  unallocatedOnly?: boolean;
}) {
  const params = new URLSearchParams();
  appendParam(params, "project_id", input.projectId);
  params.set("direction", "out");
  params.set("entry_type", "expense_settlement");
  appendParam(params, "ledger_id", input.ledgerId);
  appendParam(params, "expense_request_id", input.expenseRequestId);
  appendParam(params, "expense_settlement_id", input.expenseSettlementId);
  if (input.unallocatedOnly) params.set("unallocated_only", "true");
  return {
    key: input.unallocatedOnly
      ? "open_unallocated_expense_ledger"
      : "open_expense_ledger",
    label: "去处理",
    target: buildTarget("/finance/ledger", params),
  };
}

function appendParam(params: URLSearchParams, key: string, value: string | null | undefined) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}

function buildTarget(path: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function toDateTime(date: string | null) {
  return date ? `${date}T00:00:00.000Z` : new Date(0).toISOString();
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
