import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

export type FinanceLedgerRecord = {
  id: string;
  tenant_id: string;
  project_id: string | null;
  cost_category_id?: string | null;
  direction: "in" | "out";
  entry_type: string;
  amount: number | string | null;
  occurred_at: string | null;
  summary: string | null;
  project?: { id: string; name: string | null; status: string | null } | null;
  cost_category?: {
    id: string;
    code: string | null;
    name: string | null;
    status: string | null;
  } | null;
  handler?: { id: string; name: string | null; phone: string | null } | null;
};

export type FinanceLedgerListData = {
  list: FinanceLedgerRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type FinanceLedgerResult = FinanceLedgerListData & {
  error: string | null;
};

export type FinanceReceivableStatus =
  | "pending"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "canceled";

export type FinanceReceivableRecord = {
  id: string;
  tenant_id: string;
  project_id: string;
  workflow_instance_id: string | null;
  workflow_node_key: string | null;
  source_type: string;
  source_id: string | null;
  payment_type: string;
  title: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_date: string;
  status: FinanceReceivableStatus;
  overdue_days: number;
  created_at: string | null;
  updated_at: string | null;
  project?: { id: string; name: string | null; status: string | null } | null;
};

export type FinanceReceivableSummary = {
  contract_amount: number;
  receivable_amount: number;
  paid_amount: number;
  remaining_amount: number;
  overdue_amount: number;
  overdue_count: number;
};

export type FinanceReceivableListData = {
  list: FinanceReceivableRecord[];
  pagination: FinanceLedgerListData["pagination"];
  summary?: FinanceReceivableSummary;
};

export type FinanceReceivableResult = FinanceReceivableListData & {
  error: string | null;
};

const FINANCE_LEDGER_PAGE_SIZE = 20;
const FINANCE_RECEIVABLE_PAGE_SIZE = 20;
const FINANCE_PROJECT_SUMMARY_PAGE_SIZE = 20;

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

export type FinanceProjectSummaryListData = {
  list: FinanceProjectOperatingSummary[];
  pagination: FinanceLedgerListData["pagination"];
  summary: FinanceProjectOperatingSummaryTotals;
};

export type FinanceProjectSummaryResult = FinanceProjectSummaryListData & {
  error: string | null;
};

export function emptyFinanceLedger(page = 1): FinanceLedgerResult {
  return {
    list: [],
    pagination: {
      page,
      pageSize: FINANCE_LEDGER_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    },
    error: null,
  };
}

export function emptyFinanceReceivables(page = 1): FinanceReceivableResult {
  return {
    list: [],
    pagination: {
      page,
      pageSize: FINANCE_RECEIVABLE_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    },
    error: null,
  };
}

export function emptyFinanceProjectSummary(
  page = 1,
): FinanceProjectSummaryResult {
  return {
    list: [],
    pagination: {
      page,
      pageSize: FINANCE_PROJECT_SUMMARY_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    },
    summary: emptyFinanceProjectSummaryTotals(),
    error: null,
  };
}

export async function fetchFinanceLedger(query: {
  page?: number;
  pageSize?: number;
  project_id?: string;
  direction?: string;
  cost_category_id?: string;
  unallocated_only?: string;
}): Promise<FinanceLedgerResult> {
  const token = await getAdminToken();
  const page = normalizeFinanceLedgerPage(query.page);
  const pageSize = normalizeFinanceLedgerPageSize(query.pageSize);

  if (!token) {
    return {
      ...emptyFinanceLedger(page),
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
      },
      error: "缺少登录凭证",
    };
  }

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  appendOptionalParam(params, "project_id", query.project_id);
  appendOptionalParam(params, "direction", query.direction);
  appendOptionalParam(params, "cost_category_id", query.cost_category_id);
  appendOptionalParam(params, "unallocated_only", query.unallocated_only);

  try {
    const response = await fetch(buildBackendUrl(`/finance/ledger?${params}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<FinanceLedgerListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 0,
        },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
      },
      error: error instanceof Error ? error.message : "财务台账加载失败",
    };
  }
}

export async function fetchFinanceReceivables(query: {
  page?: number;
  pageSize?: number;
  status?: string;
  payment_type?: string;
  project_id?: string;
  due_date_from?: string;
  due_date_to?: string;
  overdue_only?: boolean;
}): Promise<FinanceReceivableResult> {
  const token = await getAdminToken();
  const page = normalizeFinanceLedgerPage(query.page);
  const pageSize = normalizeFinanceLedgerPageSize(
    query.pageSize ?? FINANCE_RECEIVABLE_PAGE_SIZE,
  );

  if (!token) {
    return {
      ...emptyFinanceReceivables(page),
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  appendOptionalParam(params, "status", query.status);
  appendOptionalParam(params, "payment_type", query.payment_type);
  appendOptionalParam(params, "project_id", query.project_id);
  appendOptionalParam(params, "due_date_from", query.due_date_from);
  appendOptionalParam(params, "due_date_to", query.due_date_to);
  if (query.overdue_only) params.set("overdue_only", "true");

  try {
    const response = await fetch(buildBackendUrl(`/finance/receivables?${params}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<FinanceReceivableListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "应收计划加载失败",
    };
  }
}

export async function fetchFinanceProjectSummaries(query: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  risk_level?: string;
  risk_flag?: string;
  budget_configured?: string;
  has_unallocated_expense?: string;
  overdue?: string;
  min_budget_usage_ratio?: string;
  max_projected_budget_gross_margin?: string;
}): Promise<FinanceProjectSummaryResult> {
  const token = await getAdminToken();
  const page = normalizeFinanceLedgerPage(query.page);
  const pageSize = normalizeFinanceLedgerPageSize(
    query.pageSize ?? FINANCE_PROJECT_SUMMARY_PAGE_SIZE,
  );

  if (!token) {
    return {
      ...emptyFinanceProjectSummary(page),
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  appendOptionalParam(params, "keyword", query.keyword);
  appendOptionalParam(params, "status", query.status);
  appendOptionalParam(params, "risk_level", query.risk_level);
  appendOptionalParam(params, "risk_flag", query.risk_flag);
  appendOptionalParam(params, "budget_configured", query.budget_configured);
  appendOptionalParam(
    params,
    "has_unallocated_expense",
    query.has_unallocated_expense,
  );
  appendOptionalParam(params, "overdue", query.overdue);
  appendOptionalParam(
    params,
    "min_budget_usage_ratio",
    query.min_budget_usage_ratio,
  );
  appendOptionalParam(
    params,
    "max_projected_budget_gross_margin",
    query.max_projected_budget_gross_margin,
  );

  try {
    const response = await fetch(buildBackendUrl(`/finance/project-summary?${params}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<FinanceProjectSummaryListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
        summary: emptyFinanceProjectSummaryTotals(),
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      summary: emptyFinanceProjectSummaryTotals(),
      error: error instanceof Error ? error.message : "项目经营汇总加载失败",
    };
  }
}

function emptyFinanceProjectSummaryTotals(): FinanceProjectOperatingSummaryTotals {
  return {
    project_count: 0,
    contract_amount: 0,
    receivable_amount: 0,
    received_amount: 0,
    receivable_remaining_amount: 0,
    overdue_amount: 0,
    overdue_count: 0,
    expense_paid_amount: 0,
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

function normalizeFinanceLedgerPage(value: number | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizeFinanceLedgerPageSize(value: number | undefined) {
  const pageSize = Number(value || FINANCE_LEDGER_PAGE_SIZE);
  if (!Number.isFinite(pageSize) || pageSize <= 0) return FINANCE_LEDGER_PAGE_SIZE;
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
