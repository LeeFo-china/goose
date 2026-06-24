import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import type { FinanceLedgerListData } from "@/components/finance/finance-requests";

const FINANCE_COST_CATEGORY_PAGE_SIZE = 100;

export type ProjectCostBudgetRiskLevel = "normal" | "warning" | "danger";

export type FinanceCostCategoryRecord = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
  sort_order: number;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceCostCategoryListData = {
  list: FinanceCostCategoryRecord[];
  pagination: FinanceLedgerListData["pagination"];
};

export type FinanceCostCategoryResult = FinanceCostCategoryListData & {
  error: string | null;
};

export type ProjectCostBudgetListItem = {
  id: string;
  project_id: string;
  cost_category_id: string;
  category_code: string | null;
  category_name: string | null;
  budget_amount: number;
  expense_amount: number;
  remaining_amount: number;
  usage_ratio: number | null;
  warning_threshold_percent: number;
  risk_level: ProjectCostBudgetRiskLevel;
  remark: string | null;
  status: string | null;
};

export type ProjectCostBudgetSummary = {
  budget_configured: boolean;
  budget_amount: number;
  expense_amount: number;
  remaining_amount: number;
  usage_ratio: number | null;
  unallocated_expense_amount: number;
  risk_level: ProjectCostBudgetRiskLevel;
};

export type ProjectCostBudgetListData = {
  list: ProjectCostBudgetListItem[];
  summary: ProjectCostBudgetSummary;
};

export type ProjectCostBudgetResult = ProjectCostBudgetListData & {
  error: string | null;
};

export type SaveProjectCostBudgetItem = {
  cost_category_id: string;
  budget_amount: number;
  warning_threshold_percent?: number;
  remark?: string | null;
};

export function emptyFinanceCostCategories(page = 1): FinanceCostCategoryResult {
  return {
    list: [],
    pagination: {
      page,
      pageSize: FINANCE_COST_CATEGORY_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    },
    error: null,
  };
}

export function emptyProjectCostBudgets(): ProjectCostBudgetResult {
  return {
    list: [],
    summary: emptyProjectCostBudgetSummary(),
    error: null,
  };
}

export async function fetchFinanceCostCategories(query: {
  page?: number;
  pageSize?: number;
  status?: "active" | "inactive";
} = {}): Promise<FinanceCostCategoryResult> {
  const token = await getAdminToken();
  const page = normalizePage(query.page);
  const pageSize = normalizePageSize(
    query.pageSize ?? FINANCE_COST_CATEGORY_PAGE_SIZE,
  );

  if (!token) {
    return {
      ...emptyFinanceCostCategories(page),
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  appendOptionalParam(params, "status", query.status);

  try {
    const response = await fetch(
      buildBackendUrl(`/finance/cost-categories?${params}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<FinanceCostCategoryListData>(response);
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
      error: error instanceof Error ? error.message : "成本分类加载失败",
    };
  }
}

export async function fetchProjectCostBudgets(
  projectId: string,
): Promise<ProjectCostBudgetResult> {
  const token = await getAdminToken();

  if (!token) {
    return {
      ...emptyProjectCostBudgets(),
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(
      buildBackendUrl(`/projects/${projectId}/cost-budgets`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<ProjectCostBudgetListData>(response);
    return {
      ...(payload.data || {
        list: [],
        summary: emptyProjectCostBudgetSummary(),
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      summary: emptyProjectCostBudgetSummary(),
      error: error instanceof Error ? error.message : "成本预算加载失败",
    };
  }
}

export async function saveProjectCostBudgets(
  projectId: string,
  items: SaveProjectCostBudgetItem[],
): Promise<ProjectCostBudgetResult> {
  const token = await getAdminToken();

  if (!token) {
    return {
      ...emptyProjectCostBudgets(),
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(
      buildBackendUrl(`/projects/${projectId}/cost-budgets`),
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ items }),
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<ProjectCostBudgetListData>(response);
    return {
      ...(payload.data || {
        list: [],
        summary: emptyProjectCostBudgetSummary(),
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      summary: emptyProjectCostBudgetSummary(),
      error: error instanceof Error ? error.message : "成本预算保存失败",
    };
  }
}

function emptyProjectCostBudgetSummary(): ProjectCostBudgetSummary {
  return {
    budget_configured: false,
    budget_amount: 0,
    expense_amount: 0,
    remaining_amount: 0,
    usage_ratio: null,
    unallocated_expense_amount: 0,
    risk_level: "normal",
  };
}

function normalizePage(value: number | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizePageSize(value: number | undefined) {
  const pageSize = Number(value || FINANCE_COST_CATEGORY_PAGE_SIZE);
  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return FINANCE_COST_CATEGORY_PAGE_SIZE;
  }
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
