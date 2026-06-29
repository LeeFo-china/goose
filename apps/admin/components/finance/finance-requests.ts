import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import {
  emptyFinanceProjectSummaryAnalytics,
  emptyFinanceProjectSummaryTotals,
  type FinanceProjectSummaryListData,
  type FinanceProjectSummaryResult,
} from "./finance-project-summary-types";
import {
  buildFinanceLedgerSearchParams,
  normalizeFinanceLedgerPage,
  normalizeFinanceLedgerPageSize,
} from "./finance-ledger-query-utils";

export type {
  FinanceProjectOperatingSummary,
  FinanceProjectOperatingSummaryTotals,
  FinanceProjectRiskFlag,
  FinanceProjectRiskLevel,
  FinanceProjectRiskReason,
  FinanceProjectSummaryAnalytics,
  FinanceProjectSummaryListData,
  FinanceProjectSummaryRankingItem,
  FinanceProjectSummaryResult,
  FinanceProjectSummaryTrendPoint,
} from "./finance-project-summary-types";

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
  owner_employee_id: string | null;
  owner_employee_name: string | null;
  latest_follow_up_at: string | null;
  latest_follow_up_note: string | null;
  next_follow_up_at: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  canceled_by_name: string | null;
  canceled_reason: string | null;
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
    analytics: emptyFinanceProjectSummaryAnalytics(),
    error: null,
  };
}

export async function fetchFinanceLedger(query: {
  page?: number;
  pageSize?: number;
  project_id?: string;
  direction?: string;
  entry_type?: string;
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

  const params = buildFinanceLedgerSearchParams({
    ...query,
    page,
    pageSize,
  });

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
  source_type?: string;
  owner_employee_id?: string;
  project_id?: string;
  due_date_from?: string;
  due_date_to?: string;
  overdue_only?: boolean;
  follow_up_due_only?: boolean;
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
  appendOptionalParam(params, "source_type", query.source_type);
  appendOptionalParam(params, "owner_employee_id", query.owner_employee_id);
  appendOptionalParam(params, "project_id", query.project_id);
  appendOptionalParam(params, "due_date_from", query.due_date_from);
  appendOptionalParam(params, "due_date_to", query.due_date_to);
  if (query.overdue_only) params.set("overdue_only", "true");
  if (query.follow_up_due_only) params.set("follow_up_due_only", "true");

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
  include_analytics?: string;
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
  appendOptionalParam(params, "include_analytics", query.include_analytics);
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
    const data = payload.data || {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      summary: emptyFinanceProjectSummaryTotals(),
      analytics: emptyFinanceProjectSummaryAnalytics(),
    };
    return {
      ...data,
      analytics: data.analytics || emptyFinanceProjectSummaryAnalytics(),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      summary: emptyFinanceProjectSummaryTotals(),
      analytics: emptyFinanceProjectSummaryAnalytics(),
      error: error instanceof Error ? error.message : "项目经营汇总加载失败",
    };
  }
}

function appendOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}
