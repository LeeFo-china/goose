export type FinancePagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type FinanceProjectRiskLevel = "normal" | "info" | "warning" | "danger";

export type FinanceProjectRiskFlag =
  | "budget_missing"
  | "unallocated_expense"
  | "category_over_budget"
  | "project_over_budget"
  | "low_projected_margin"
  | "receivable_overdue"
  | "negative_actual_profit"
  | "negative_projected_profit";

export type FinanceProjectRiskReason = {
  code: FinanceProjectRiskFlag;
  level: FinanceProjectRiskLevel;
  title: string;
  description: string;
  current_value: number | null;
  threshold_value: number | null;
  unit: "money" | "ratio" | "count" | "boolean";
  action: {
    key: string;
    label: string;
    target: string;
  } | null;
};

export type FinanceProjectUnallocatedExpenseItem = {
  id: string;
  amount: number;
  occurred_at: string | null;
  summary: string | null;
  request_title: string | null;
  expense_category: string | null;
  applicant_name: string | null;
  applicant_phone: string | null;
  request_time: string | null;
  request_no: string | null;
};

export type FinanceProjectOperatingSummary = {
  project_id: string;
  project_name: string | null;
  project_status: string | null;
  contract_amount: number;
  receivable_amount: number;
  received_amount: number;
  receivable_remaining_amount: number;
  overdue_amount: number;
  overdue_count: number;
  expense_paid_amount: number;
  supplier_cost_amount: number;
  supplier_payable_open_amount: number;
  supplier_cash_paid_amount: number;
  actual_profit_amount: number;
  projected_profit_amount: number;
  net_cash_flow_amount: number;
  actual_gross_margin: number | null;
  projected_gross_margin: number | null;
  ledger_entry_count: number;
  budget_configured: boolean;
  budget_cost_amount: number;
  budget_remaining_amount: number;
  budget_usage_ratio: number | null;
  unallocated_expense_amount: number;
  projected_budget_profit_amount: number;
  profit_variance_amount: number;
  projected_budget_gross_margin: number | null;
  risk_level: FinanceProjectRiskLevel;
  risk_flags: FinanceProjectRiskFlag[];
  risk_reasons: FinanceProjectRiskReason[];
  unallocated_expense_items: FinanceProjectUnallocatedExpenseItem[];
};

export type FinanceProjectOperatingSummaryTotals = {
  project_count: number;
  contract_amount: number;
  receivable_amount: number;
  received_amount: number;
  receivable_remaining_amount: number;
  overdue_amount: number;
  overdue_count: number;
  expense_paid_amount: number;
  supplier_cost_amount: number;
  supplier_payable_open_amount: number;
  supplier_cash_paid_amount: number;
  actual_profit_amount: number;
  projected_profit_amount: number;
  net_cash_flow_amount: number;
  actual_gross_margin: number | null;
  projected_gross_margin: number | null;
  budget_configured_count: number;
  budget_cost_amount: number;
  budget_remaining_amount: number;
  budget_usage_ratio: number | null;
  unallocated_expense_amount: number;
  projected_budget_profit_amount: number;
  profit_variance_amount: number;
  projected_budget_gross_margin: number | null;
  risk_count: number;
  risk_level: FinanceProjectRiskLevel;
  risk_counts: Record<FinanceProjectRiskLevel, number>;
  risk_flag_counts: Record<FinanceProjectRiskFlag, number>;
};

export type FinanceProjectSummaryRankingItem = {
  project_id: string;
  project_name: string | null;
  project_status: string | null;
  value: number;
  helper: string;
  risk_level: FinanceProjectRiskLevel;
  target: string;
};

export type FinanceProjectSummaryTrendPoint = {
  date: string;
  income_amount: number;
  expense_amount: number;
  net_cash_flow_amount: number;
};

export type FinanceProjectSummaryAnalytics = {
  scope: {
    project_count: number;
    project_limit: number;
    truncated: boolean;
    trend_days: number;
  };
  rankings: {
    high_risk: FinanceProjectSummaryRankingItem[];
    unallocated_expense: FinanceProjectSummaryRankingItem[];
    overdue_receivable: FinanceProjectSummaryRankingItem[];
    low_margin: FinanceProjectSummaryRankingItem[];
  };
  trends: FinanceProjectSummaryTrendPoint[];
};

export type FinanceProjectSummaryListData = {
  list: FinanceProjectOperatingSummary[];
  pagination: FinancePagination;
  summary: FinanceProjectOperatingSummaryTotals;
  analytics?: FinanceProjectSummaryAnalytics;
};

export type FinanceProjectSummaryResult = FinanceProjectSummaryListData & {
  analytics: FinanceProjectSummaryAnalytics;
  error: string | null;
};

export function emptyFinanceProjectSummaryTotals(): FinanceProjectOperatingSummaryTotals {
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
    risk_flag_counts: {
      budget_missing: 0,
      unallocated_expense: 0,
      category_over_budget: 0,
      project_over_budget: 0,
      low_projected_margin: 0,
      receivable_overdue: 0,
      negative_actual_profit: 0,
      negative_projected_profit: 0,
    },
  };
}

export function calculateDisplayedProjectCost(summary: Pick<
  FinanceProjectOperatingSummary,
  "expense_paid_amount" | "supplier_cost_amount"
>): number {
  return finiteMoney(summary.expense_paid_amount) +
    finiteMoney(summary.supplier_cost_amount);
}

export function buildDisplayedProjectCostMetric(summary: Pick<
  FinanceProjectOperatingSummary,
  "expense_paid_amount" | "supplier_cost_amount"
>) {
  return {
    label: "已发生项目成本" as const,
    value: calculateDisplayedProjectCost(summary),
    emptyText: "暂无成本" as const,
  };
}

function finiteMoney(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function emptyFinanceProjectSummaryAnalytics(): FinanceProjectSummaryAnalytics {
  return {
    scope: {
      project_count: 0,
      project_limit: 100,
      truncated: false,
      trend_days: 30,
    },
    rankings: {
      high_risk: [],
      unallocated_expense: [],
      overdue_receivable: [],
      low_margin: [],
    },
    trends: [],
  };
}
