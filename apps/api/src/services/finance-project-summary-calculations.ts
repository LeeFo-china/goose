import type {
  FinanceProjectBudgetTotals,
  FinanceProjectLedgerTotals,
  FinanceProjectReceivableTotals,
  FinanceProjectSummaryProjectRow,
  FinanceProjectSupplierTotals,
  FinanceProjectUnallocatedExpenseItem,
} from "@/repositories/finance-project-summary";
import {
  buildFinanceProjectRisk,
  type FinanceProjectRiskFlag,
  type FinanceProjectRiskLevel,
} from "@/services/finance-project-risk";
import type {
  FinanceProjectOperatingSummary,
  FinanceProjectOperatingSummaryTotals,
} from "@/services/finance-project-summary";

export function buildProjectOperatingSummary(input: {
  project: FinanceProjectSummaryProjectRow;
  ledgerTotals?: FinanceProjectLedgerTotals;
  supplierTotals?: FinanceProjectSupplierTotals;
  unallocatedExpenseItems?: FinanceProjectUnallocatedExpenseItem[];
  receivableTotals?: FinanceProjectReceivableTotals;
  budgetTotals?: FinanceProjectBudgetTotals;
}): FinanceProjectOperatingSummary {
  const contractAmount = resolveContractAmount(input.project);
  const receivedAmount = roundMoney(input.ledgerTotals?.income_amount ?? 0);
  const expensePaidAmount = roundMoney(input.ledgerTotals?.expense_amount ?? 0);
  const supplierCostAmount = roundMoney(
    input.supplierTotals?.supplier_cost_amount ?? 0,
  );
  const supplierPayableOpenAmount = roundMoney(
    input.supplierTotals?.supplier_payable_open_amount ?? 0,
  );
  const supplierCashPaidAmount = roundMoney(
    input.supplierTotals?.supplier_cash_paid_amount ?? 0,
  );
  const actualCostAmount = roundMoney(expensePaidAmount + supplierCostAmount);
  const actualProfitAmount = roundMoney(receivedAmount - actualCostAmount);
  const projectedProfitAmount = roundMoney(contractAmount - actualCostAmount);
  const netCashFlowAmount = roundMoney(
    receivedAmount - expensePaidAmount - supplierCashPaidAmount,
  );
  const budgetConfigured = Boolean(input.budgetTotals);
  const budgetCostAmount = budgetConfigured
    ? roundMoney(input.budgetTotals?.budget_amount ?? 0)
    : 0;
  const budgetRemainingAmount = budgetConfigured
    ? roundMoney(budgetCostAmount - actualCostAmount)
    : 0;
  const budgetUsageRatio = budgetConfigured && budgetCostAmount > 0
    ? roundRatio(actualCostAmount / budgetCostAmount)
    : null;
  const unallocatedExpenseAmount = roundMoney(
    input.ledgerTotals?.unallocated_expense_amount ?? 0,
  );
  const projectedBudgetProfitAmount = budgetConfigured
    ? roundMoney(contractAmount - budgetCostAmount)
    : 0;
  const profitVarianceAmount = budgetConfigured
    ? roundMoney(actualProfitAmount - projectedBudgetProfitAmount)
    : 0;
  const projectedBudgetGrossMargin = budgetConfigured && contractAmount > 0
    ? roundRatio(projectedBudgetProfitAmount / contractAmount)
    : null;
  const overdueAmount = roundMoney(input.receivableTotals?.overdue_amount ?? 0);
  const overdueCount = input.receivableTotals?.overdue_count ?? 0;
  const risk = buildFinanceProjectRisk({
    projectId: input.project.id,
    contractAmount,
    receivedAmount,
    expensePaidAmount: actualCostAmount,
    budgetConfigured,
    budgetCostAmount,
    budgetUsageRatio,
    projectedBudgetGrossMargin,
    overdueCount,
    overdueAmount,
    unallocatedExpenseAmount,
    hasCategoryOverBudget: hasCategoryOverBudget({
      budgetTotals: input.budgetTotals,
      expenseByCategory: input.ledgerTotals?.expense_by_category,
      supplierCostByCategory:
        input.supplierTotals?.supplier_cost_by_category,
    }),
  });

  return {
    project_id: input.project.id,
    project_name: input.project.name,
    project_status: input.project.status,
    contract_amount: contractAmount,
    receivable_amount: roundMoney(input.receivableTotals?.receivable_amount ?? 0),
    received_amount: receivedAmount,
    receivable_remaining_amount: roundMoney(
      input.receivableTotals?.receivable_remaining_amount ?? 0,
    ),
    overdue_amount: overdueAmount,
    overdue_count: overdueCount,
    expense_paid_amount: expensePaidAmount,
    supplier_cost_amount: supplierCostAmount,
    supplier_payable_open_amount: supplierPayableOpenAmount,
    supplier_cash_paid_amount: supplierCashPaidAmount,
    actual_profit_amount: actualProfitAmount,
    projected_profit_amount: projectedProfitAmount,
    net_cash_flow_amount: netCashFlowAmount,
    actual_gross_margin: receivedAmount > 0
      ? roundRatio(actualProfitAmount / receivedAmount)
      : null,
    projected_gross_margin: contractAmount > 0
      ? roundRatio(projectedProfitAmount / contractAmount)
      : null,
    ledger_entry_count: input.ledgerTotals?.ledger_entry_count ?? 0,
    budget_configured: budgetConfigured,
    budget_cost_amount: budgetCostAmount,
    budget_remaining_amount: budgetRemainingAmount,
    budget_usage_ratio: budgetUsageRatio,
    unallocated_expense_amount: unallocatedExpenseAmount,
    projected_budget_profit_amount: projectedBudgetProfitAmount,
    profit_variance_amount: profitVarianceAmount,
    projected_budget_gross_margin: projectedBudgetGrossMargin,
    risk_level: risk.risk_level,
    risk_flags: risk.risk_flags,
    risk_reasons: risk.risk_reasons,
    unallocated_expense_items: input.unallocatedExpenseItems ?? [],
  };
}

export function summarizeFinanceProjectSummaryList(
  list: FinanceProjectOperatingSummary[],
): FinanceProjectOperatingSummaryTotals {
  const totals = list.reduce<FinanceProjectOperatingSummaryTotals>((acc, item) => {
    acc.project_count += 1;
    acc.contract_amount += item.contract_amount;
    acc.receivable_amount += item.receivable_amount;
    acc.received_amount += item.received_amount;
    acc.receivable_remaining_amount += item.receivable_remaining_amount;
    acc.overdue_amount += item.overdue_amount;
    acc.overdue_count += item.overdue_count;
    acc.expense_paid_amount += item.expense_paid_amount;
    acc.supplier_cost_amount += item.supplier_cost_amount;
    acc.supplier_payable_open_amount += item.supplier_payable_open_amount;
    acc.supplier_cash_paid_amount += item.supplier_cash_paid_amount;
    acc.actual_profit_amount += item.actual_profit_amount;
    acc.projected_profit_amount += item.projected_profit_amount;
    acc.net_cash_flow_amount += item.net_cash_flow_amount;
    if (item.budget_configured) acc.budget_configured_count += 1;
    acc.budget_cost_amount += item.budget_cost_amount;
    acc.budget_remaining_amount += item.budget_remaining_amount;
    acc.unallocated_expense_amount += item.unallocated_expense_amount;
    acc.projected_budget_profit_amount += item.projected_budget_profit_amount;
    acc.profit_variance_amount += item.profit_variance_amount;
    acc.risk_counts[item.risk_level] += 1;
    for (const flag of item.risk_flags) acc.risk_flag_counts[flag] += 1;
    if (item.risk_level !== "normal") {
      acc.risk_count += 1;
      acc.risk_level = maxRiskLevel(acc.risk_level, item.risk_level);
    }
    return acc;
  }, emptyFinanceProjectOperatingSummaryTotals());

  totals.contract_amount = roundMoney(totals.contract_amount);
  totals.receivable_amount = roundMoney(totals.receivable_amount);
  totals.received_amount = roundMoney(totals.received_amount);
  totals.receivable_remaining_amount = roundMoney(
    totals.receivable_remaining_amount,
  );
  totals.overdue_amount = roundMoney(totals.overdue_amount);
  totals.expense_paid_amount = roundMoney(totals.expense_paid_amount);
  totals.supplier_cost_amount = roundMoney(totals.supplier_cost_amount);
  totals.supplier_payable_open_amount = roundMoney(
    totals.supplier_payable_open_amount,
  );
  totals.supplier_cash_paid_amount = roundMoney(
    totals.supplier_cash_paid_amount,
  );
  totals.actual_profit_amount = roundMoney(totals.actual_profit_amount);
  totals.projected_profit_amount = roundMoney(totals.projected_profit_amount);
  totals.net_cash_flow_amount = roundMoney(totals.net_cash_flow_amount);
  totals.budget_cost_amount = roundMoney(totals.budget_cost_amount);
  totals.budget_remaining_amount = roundMoney(totals.budget_remaining_amount);
  totals.unallocated_expense_amount = roundMoney(
    totals.unallocated_expense_amount,
  );
  totals.projected_budget_profit_amount = roundMoney(
    totals.projected_budget_profit_amount,
  );
  totals.profit_variance_amount = roundMoney(totals.profit_variance_amount);
  totals.actual_gross_margin = totals.received_amount > 0
    ? roundRatio(totals.actual_profit_amount / totals.received_amount)
    : null;
  totals.projected_gross_margin = totals.contract_amount > 0
    ? roundRatio(totals.projected_profit_amount / totals.contract_amount)
    : null;
  totals.budget_usage_ratio = totals.budget_cost_amount > 0
    ? roundRatio(
      (totals.expense_paid_amount + totals.supplier_cost_amount) /
        totals.budget_cost_amount,
    )
    : null;
  totals.projected_budget_gross_margin = totals.contract_amount > 0 &&
      totals.budget_configured_count > 0
    ? roundRatio(totals.projected_budget_profit_amount / totals.contract_amount)
    : null;

  return totals;
}

export function getTenantToday() {
  return new Date().toISOString().slice(0, 10);
}

function emptyFinanceProjectOperatingSummaryTotals(): FinanceProjectOperatingSummaryTotals {
  return {
    project_count: 0,
    contract_amount: 0,
    receivable_amount: 0,
    received_amount: 0,
    receivable_remaining_amount: 0,
    overdue_amount: 0,
    overdue_count: 0,
    expense_paid_amount: 0,
    supplier_cost_amount: 0,
    supplier_payable_open_amount: 0,
    supplier_cash_paid_amount: 0,
    actual_profit_amount: 0,
    projected_profit_amount: 0,
    net_cash_flow_amount: 0,
    actual_gross_margin: null,
    projected_gross_margin: null,
    budget_configured_count: 0,
    budget_cost_amount: 0,
    budget_remaining_amount: 0,
    budget_usage_ratio: null,
    unallocated_expense_amount: 0,
    projected_budget_profit_amount: 0,
    profit_variance_amount: 0,
    projected_budget_gross_margin: null,
    risk_count: 0,
    risk_level: "normal",
    risk_counts: { normal: 0, info: 0, warning: 0, danger: 0 },
    risk_flag_counts: emptyRiskFlagCounts(),
  };
}

function emptyRiskFlagCounts(): Record<FinanceProjectRiskFlag, number> {
  return {
    budget_missing: 0,
    unallocated_expense: 0,
    category_over_budget: 0,
    project_over_budget: 0,
    low_projected_margin: 0,
    receivable_overdue: 0,
    negative_actual_profit: 0,
    negative_projected_profit: 0,
  };
}

function hasCategoryOverBudget(input: {
  budgetTotals?: FinanceProjectBudgetTotals;
  expenseByCategory?: Map<string, number>;
  supplierCostByCategory?: Map<string, number>;
}) {
  if (!input.budgetTotals) return false;

  for (const [categoryId, budget] of input.budgetTotals.category_budgets) {
    const expenseAmount = (input.expenseByCategory?.get(categoryId) ?? 0) +
      (input.supplierCostByCategory?.get(categoryId) ?? 0);
    const warningAmount = budget.budget_amount *
      (budget.warning_threshold_percent / 100);
    if (expenseAmount > warningAmount) return true;
  }

  return false;
}

function maxRiskLevel(
  left: FinanceProjectRiskLevel,
  right: FinanceProjectRiskLevel,
) {
  const order: Record<FinanceProjectRiskLevel, number> = {
    normal: 0,
    info: 1,
    warning: 2,
    danger: 3,
  };
  return order[right] > order[left] ? right : left;
}

function resolveContractAmount(project: FinanceProjectSummaryProjectRow) {
  const signedAmount = normalizeMoney(project.signed_amount);
  if (signedAmount > 0) return signedAmount;
  return normalizeMoney(project.budget);
}

function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? roundMoney(amount) : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
