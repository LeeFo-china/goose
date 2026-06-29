export type ProjectFinanceReconciliationSummary = {
  project_id: string;
  receivable_amount: number;
  received_amount: number;
  allocated_amount: number;
  ledger_income_amount: number;
  expense_paid_amount: number;
  ledger_expense_amount: number;
  exception_count: number;
  danger_count: number;
  warning_count: number;
  open_exception_count: number;
  acknowledged_exception_count: number;
  ignored_exception_count: number;
  resolved_exception_count: number;
  latest_exception_at: string | null;
  latest_action_at: string | null;
  latest_action_remark: string | null;
  latest_actor_employee_name: string | null;
};

export type ProjectReconciliationCheckStatus = "success" | "warning" | "danger";

export type ProjectReconciliationCheckItem = {
  key: "income_ledger" | "payment_allocation" | "expense_ledger" | "exceptions";
  label: string;
  status: ProjectReconciliationCheckStatus;
  primary: number;
  secondary: number;
  helper: string;
};

const MONEY_TOLERANCE = 0.009;

export function buildProjectReconciliationChecks(
  summary: ProjectFinanceReconciliationSummary,
): ProjectReconciliationCheckItem[] {
  const incomeLedgerDiff = roundMoney(
    summary.received_amount - summary.ledger_income_amount,
  );
  const paymentAllocationDiff = roundMoney(
    summary.received_amount - summary.allocated_amount,
  );
  const expenseLedgerDiff = roundMoney(
    summary.expense_paid_amount - summary.ledger_expense_amount,
  );

  return [
    {
      key: "income_ledger",
      label: "收款入账",
      status: amountDiffStatus(incomeLedgerDiff),
      primary: summary.received_amount,
      secondary: summary.ledger_income_amount,
      helper: `差异 ${formatSignedAmount(incomeLedgerDiff)}`,
    },
    {
      key: "payment_allocation",
      label: "收款核销",
      status: amountDiffStatus(paymentAllocationDiff),
      primary: summary.received_amount,
      secondary: summary.allocated_amount,
      helper: `未核销 ${formatSignedAmount(paymentAllocationDiff)}`,
    },
    {
      key: "expense_ledger",
      label: "费用入账",
      status: amountDiffStatus(expenseLedgerDiff),
      primary: summary.expense_paid_amount,
      secondary: summary.ledger_expense_amount,
      helper: `差异 ${formatSignedAmount(expenseLedgerDiff)}`,
    },
    {
      key: "exceptions",
      label: "异常清单",
      status: summary.open_exception_count <= 0
        ? "success"
        : summary.danger_count > 0
        ? "danger"
        : summary.warning_count > 0
          ? "warning"
          : "success",
      primary: summary.exception_count,
      secondary: summary.danger_count,
      helper:
        `未处理 ${summary.open_exception_count} 条 / 已解决 ${summary.resolved_exception_count} 条`,
    },
  ];
}

export function projectReconciliationStatusLabel(
  status: ProjectReconciliationCheckStatus,
) {
  if (status === "danger") return "高风险";
  if (status === "warning") return "待核对";
  return "一致";
}

export function projectReconciliationStatusVariant(
  status: ProjectReconciliationCheckStatus,
) {
  if (status === "danger") return "danger" as const;
  if (status === "warning") return "warning" as const;
  return "success" as const;
}

function amountDiffStatus(value: number): ProjectReconciliationCheckStatus {
  return Math.abs(value) > MONEY_TOLERANCE ? "warning" : "success";
}

function formatSignedAmount(value: number) {
  if (Math.abs(value) <= MONEY_TOLERANCE) return "0.00";
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
