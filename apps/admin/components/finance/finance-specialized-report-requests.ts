import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import {
  buildFinanceCostCategorySummarySearchParams,
  buildFinanceProjectRankingSearchParams,
  buildFinanceReceivableAgingSearchParams,
  type FinanceCostCategorySummaryQuery,
  type FinanceProjectRankingQuery,
  type FinanceReceivableAgingQuery,
} from "./finance-operating-report-utils";

export type FinancePagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type FinanceProjectRankingItem = {
  project_id: string | null;
  project_name: string;
  project_status: string | null;
  income_amount: number;
  expense_amount: number;
  gross_profit_amount: number;
  gross_profit_rate: number;
  receivable_amount: number;
  received_amount: number;
  receivable_remaining_amount: number;
  overdue_receivable_amount: number;
  reconciliation_exception_count: number;
};

export type FinanceProjectRankingResult = {
  list: FinanceProjectRankingItem[];
  pagination: FinancePagination;
  error: string | null;
};

export type FinanceCostCategorySummaryItem = {
  cost_category_id: string | null;
  cost_category_name: string;
  expense_amount: number;
  expense_percent: number;
  ledger_entry_count: number;
  project_count: number;
};

export type FinanceCostCategorySummaryResult = {
  summary: {
    expense_amount: number;
    unallocated_expense_amount: number;
  };
  list: FinanceCostCategorySummaryItem[];
  pagination: FinancePagination;
  error: string | null;
};

export type FinanceReceivableAgingBucket = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

export type FinanceReceivableAgingItem = {
  receivable_id: string;
  project_id: string | null;
  project_name: string;
  due_date: string | null;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  overdue_days: number;
  bucket_key: string;
};

export type FinanceReceivableAgingResult = {
  buckets: FinanceReceivableAgingBucket[];
  list: FinanceReceivableAgingItem[];
  pagination: FinancePagination;
  error: string | null;
};

function emptyPagination(pageSize = 20): FinancePagination {
  return { page: 1, pageSize, total: 0, totalPages: 0 };
}

export function emptyFinanceProjectRanking(): FinanceProjectRankingResult {
  return {
    list: [],
    pagination: emptyPagination(),
    error: null,
  };
}

export function emptyFinanceCostCategorySummary(): FinanceCostCategorySummaryResult {
  return {
    summary: {
      expense_amount: 0,
      unallocated_expense_amount: 0,
    },
    list: [],
    pagination: emptyPagination(),
    error: null,
  };
}

export function emptyFinanceReceivableAging(): FinanceReceivableAgingResult {
  return {
    buckets: [],
    list: [],
    pagination: emptyPagination(),
    error: null,
  };
}

export async function fetchFinanceProjectRanking(
  query: FinanceProjectRankingQuery,
): Promise<FinanceProjectRankingResult> {
  const token = await getAdminToken();
  if (!token) {
    return { ...emptyFinanceProjectRanking(), error: "缺少登录凭证" };
  }

  const params = buildFinanceProjectRankingSearchParams(query);
  try {
    const response = await fetch(
      buildBackendUrl(`/finance/reports/project-ranking?${params}`),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<
      Omit<FinanceProjectRankingResult, "error">
    >(response);
    return { ...(payload.data || emptyFinanceProjectRanking()), error: null };
  } catch (error) {
    return {
      ...emptyFinanceProjectRanking(),
      error: error instanceof Error ? error.message : "项目经营排行加载失败",
    };
  }
}

export async function fetchFinanceCostCategorySummary(
  query: FinanceCostCategorySummaryQuery,
): Promise<FinanceCostCategorySummaryResult> {
  const token = await getAdminToken();
  if (!token) {
    return { ...emptyFinanceCostCategorySummary(), error: "缺少登录凭证" };
  }

  const params = buildFinanceCostCategorySummarySearchParams(query);
  try {
    const response = await fetch(
      buildBackendUrl(`/finance/reports/cost-category-summary?${params}`),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<
      Omit<FinanceCostCategorySummaryResult, "error">
    >(response);
    return {
      ...(payload.data || emptyFinanceCostCategorySummary()),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyFinanceCostCategorySummary(),
      error: error instanceof Error ? error.message : "成本分类报表加载失败",
    };
  }
}

export async function fetchFinanceReceivableAging(
  query: FinanceReceivableAgingQuery,
): Promise<FinanceReceivableAgingResult> {
  const token = await getAdminToken();
  if (!token) {
    return { ...emptyFinanceReceivableAging(), error: "缺少登录凭证" };
  }

  const params = buildFinanceReceivableAgingSearchParams(query);
  try {
    const response = await fetch(
      buildBackendUrl(`/finance/reports/receivable-aging?${params}`),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<
      Omit<FinanceReceivableAgingResult, "error">
    >(response);
    return { ...(payload.data || emptyFinanceReceivableAging()), error: null };
  } catch (error) {
    return {
      ...emptyFinanceReceivableAging(),
      error: error instanceof Error ? error.message : "应收账龄报表加载失败",
    };
  }
}
