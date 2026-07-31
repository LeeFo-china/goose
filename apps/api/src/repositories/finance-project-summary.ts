import { Errors } from "@/errors/error-factory";
import {
  hasFinanceProjectRiskFilters,
  isUuid,
  normalizeMoney,
  normalizeNumber,
} from "@/repositories/finance-project-summary-helpers";
import {
  listFinanceProjectUnallocatedExpenseItems,
  type FinanceProjectUnallocatedExpenseItem,
} from "@/repositories/finance-project-summary-unallocated-items";
import {
  listFinanceProjectLedgerTotals,
  listFinanceProjectSupplierTotals,
} from "@/repositories/finance-project-summary-supplier-totals";
import {
  listFinanceProjectLedgerTrend,
} from "@/repositories/finance-project-summary-trend";
import type { FinanceProjectSummaryListQuery } from "@/schema/finance";
import { SupabaseDB } from "@/utils/supabase/index";

export type FinanceProjectSummaryProjectRow = {
  id: string;
  name: string | null;
  status: string | null;
  signed_amount: number | string | null;
  budget: number | string | null;
};

export type FinanceProjectLedgerTotals = {
  income_amount: number;
  expense_amount: number;
  unallocated_expense_amount: number;
  ledger_entry_count: number;
  expense_by_category: Map<string, number>;
};

export type FinanceProjectSupplierTotals = {
  supplier_cost_amount: number;
  supplier_payable_open_amount: number;
  supplier_cash_paid_amount: number;
  supplier_cost_by_category: Map<string, number>;
};

export type { FinanceProjectUnallocatedExpenseItem };

export type FinanceProjectReceivableTotals = {
  receivable_amount: number;
  receivable_paid_amount: number;
  receivable_remaining_amount: number;
  overdue_amount: number;
  overdue_count: number;
};

export type FinanceProjectBudgetCategoryTotals = {
  budget_amount: number;
  warning_threshold_percent: number;
};

export type FinanceProjectBudgetTotals = {
  budget_amount: number;
  category_budgets: Map<string, FinanceProjectBudgetCategoryTotals>;
};

export type FinanceProjectRiskSearchResult = {
  projectIds: string[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type FinanceProjectReceivableRow = {
  project_id: string | null;
  amount: number | string | null;
  paid_amount: number | string | null;
  due_date: string | null;
  status: string | null;
};

type FinanceProjectBudgetRow = {
  project_id: string | null;
  cost_category_id: string | null;
  budget_amount: number | string | null;
  warning_threshold_percent: number | string | null;
};

type FinanceProjectRiskSearchRow = {
  project_id: string;
  total_count: number | string | null;
};

class FinanceProjectSummaryRepository {
  async listProjects(tenantId: string, query: FinanceProjectSummaryListQuery) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, name, status, signed_amount, budget", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (query.keyword) {
      const keyword = query.keyword.trim();
      if (isUuid(keyword)) {
        request = request.or(`name.ilike.%${keyword}%,id.eq.${keyword}`);
      } else {
        request = request.ilike("name", `%${keyword}%`);
      }
    }
    if (query.status) {
      request = request.eq("status", query.status);
    }

    const { data, error, count } = await request.range(from, to);
    if (error) {
      throw Errors.dbError("查询项目经营汇总失败", error);
    }

    return {
      list: ((data as FinanceProjectSummaryProjectRow[] | null) || []),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async findProject(input: {
    tenantId: string;
    projectId: string;
  }): Promise<(FinanceProjectSummaryProjectRow & { tenant_id: string | null }) | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, tenant_id, name, status, signed_amount, budget")
      .eq("id", input.projectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目经营汇总失败", error);
    }

    const project = data as (FinanceProjectSummaryProjectRow & {
      tenant_id: string | null;
    }) | null;
    if (!project || project.tenant_id !== input.tenantId) {
      return null;
    }

    return project;
  }

  async searchProjectIdsByRisk(input: {
    tenantId: string;
    query: FinanceProjectSummaryListQuery;
  }): Promise<FinanceProjectRiskSearchResult> {
    const page = input.query.page ?? 1;
    const pageSize = Math.min(input.query.pageSize ?? 20, 100);
    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "search_finance_project_risk_ids",
      {
        p_tenant_id: input.tenantId,
        p_page: page,
        p_page_size: pageSize,
        p_keyword: input.query.keyword ?? null,
        p_status: input.query.status ?? null,
        p_risk_level: input.query.risk_level ?? null,
        p_risk_flag: input.query.risk_flag ?? null,
        p_budget_configured: input.query.budget_configured ?? null,
        p_has_unallocated_expense:
          input.query.has_unallocated_expense ?? null,
        p_overdue: input.query.overdue ?? null,
        p_min_budget_usage_ratio:
          input.query.min_budget_usage_ratio ?? null,
        p_max_projected_budget_gross_margin:
          input.query.max_projected_budget_gross_margin ?? null,
      },
    );

    if (error) {
      throw Errors.dbError("查询项目经营风险筛选失败", error);
    }

    const rows = ((data as FinanceProjectRiskSearchRow[] | null) || []);
    const total = Number(rows[0]?.total_count ?? 0);
    return {
      projectIds: rows.map((row) => row.project_id).filter(Boolean),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
  }

  async listProjectsByIds(input: {
    tenantId: string;
    projectIds: string[];
  }): Promise<FinanceProjectSummaryProjectRow[]> {
    if (input.projectIds.length === 0) return [];

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, name, status, signed_amount, budget")
      .eq("tenant_id", input.tenantId)
      .in("id", input.projectIds);

    if (error) {
      throw Errors.dbError("查询项目经营汇总失败", error);
    }

    const byId = new Map(
      ((data as FinanceProjectSummaryProjectRow[] | null) || [])
        .map((project) => [project.id, project]),
    );
    return input.projectIds
      .map((projectId) => byId.get(projectId))
      .filter((project): project is FinanceProjectSummaryProjectRow =>
        Boolean(project)
      );
  }

  async listProjectsForAnalytics(input: {
    tenantId: string;
    query: FinanceProjectSummaryListQuery;
    limit: number;
  }): Promise<{
    list: FinanceProjectSummaryProjectRow[];
    total: number;
    limit: number;
  }> {
    const limit = Math.min(Math.max(Math.floor(input.limit), 1), 100);
    if (hasFinanceProjectRiskFilters(input.query)) {
      const search = await this.searchProjectIdsByRisk({
        tenantId: input.tenantId,
        query: {
          ...input.query,
          page: 1,
          pageSize: limit,
        },
      });
      return {
        list: await this.listProjectsByIds({
          tenantId: input.tenantId,
          projectIds: search.projectIds,
        }),
        total: search.pagination.total,
        limit,
      };
    }

    let request = SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, name, status, signed_amount, budget", { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .range(0, limit - 1);

    if (input.query.keyword) {
      const keyword = input.query.keyword.trim();
      if (isUuid(keyword)) {
        request = request.or(`name.ilike.%${keyword}%,id.eq.${keyword}`);
      } else {
        request = request.ilike("name", `%${keyword}%`);
      }
    }
    if (input.query.status) {
      request = request.eq("status", input.query.status);
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询项目财务分析范围失败", error);
    }

    return {
      list: ((data as FinanceProjectSummaryProjectRow[] | null) || []),
      total: count || 0,
      limit,
    };
  }

  async listLedgerTotals(input: {
    tenantId: string;
    projectIds: string[];
  }): Promise<Map<string, FinanceProjectLedgerTotals>> {
    return listFinanceProjectLedgerTotals(input);
  }

  async listSupplierTotals(input: {
    tenantId: string;
    projectIds: string[];
  }): Promise<Map<string, FinanceProjectSupplierTotals>> {
    return listFinanceProjectSupplierTotals(input);
  }

  async listUnallocatedExpenseItems(input: {
    tenantId: string;
    projectIds: string[];
    limitPerProject: number;
  }): Promise<Map<string, FinanceProjectUnallocatedExpenseItem[]>> {
    return listFinanceProjectUnallocatedExpenseItems(input);
  }

  async listLedgerTrend(input: {
    tenantId: string;
    projectIds: string[];
    dateFrom: string;
  }): Promise<Array<{
    date: string;
    income_amount: number;
    expense_amount: number;
    supplier_cash_paid_amount: number;
  }>> {
    return listFinanceProjectLedgerTrend(input);
  }

  async listReceivableTotals(input: {
    tenantId: string;
    projectIds: string[];
    tenantToday: string;
  }): Promise<Map<string, FinanceProjectReceivableTotals>> {
    if (input.projectIds.length === 0) {
      return new Map();
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .select("project_id, amount, paid_amount, due_date, status")
      .eq("tenant_id", input.tenantId)
      .in("project_id", input.projectIds);

    if (error) {
      throw Errors.dbError("查询项目应收汇总失败", error);
    }

    const totals = new Map<string, FinanceProjectReceivableTotals>();
    for (const row of ((data as FinanceProjectReceivableRow[] | null) || [])) {
      if (!row.project_id || row.status === "canceled") continue;
      const current = totals.get(row.project_id) || {
        receivable_amount: 0,
        receivable_paid_amount: 0,
        receivable_remaining_amount: 0,
        overdue_amount: 0,
        overdue_count: 0,
      };
      const amount = normalizeMoney(row.amount);
      const paidAmount = normalizeMoney(row.paid_amount);
      const remainingAmount = Math.max(amount - paidAmount, 0);
      current.receivable_amount += amount;
      current.receivable_paid_amount += paidAmount;
      current.receivable_remaining_amount += remainingAmount;
      if (isOverdueReceivable(row, input.tenantToday, remainingAmount)) {
        current.overdue_amount += remainingAmount;
        current.overdue_count += 1;
      }
      totals.set(row.project_id, current);
    }

    return totals;
  }

  async listBudgetTotals(input: {
    tenantId: string;
    projectIds: string[];
  }): Promise<Map<string, FinanceProjectBudgetTotals>> {
    if (input.projectIds.length === 0) {
      return new Map();
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_cost_budgets")
      .select("project_id, cost_category_id, budget_amount, warning_threshold_percent")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active")
      .in("project_id", input.projectIds);

    if (error) {
      throw Errors.dbError("查询项目成本预算汇总失败", error);
    }

    const totals = new Map<string, FinanceProjectBudgetTotals>();
    for (const row of ((data as FinanceProjectBudgetRow[] | null) || [])) {
      if (!row.project_id || !row.cost_category_id) continue;
      const current = totals.get(row.project_id) || {
        budget_amount: 0,
        category_budgets: new Map<string, FinanceProjectBudgetCategoryTotals>(),
      };
      const budgetAmount = normalizeMoney(row.budget_amount);
      current.budget_amount += budgetAmount;
      current.category_budgets.set(row.cost_category_id, {
        budget_amount: budgetAmount,
        warning_threshold_percent: normalizeNumber(
          row.warning_threshold_percent,
          100,
        ),
      });
      totals.set(row.project_id, current);
    }

    return totals;
  }
}

function isOverdueReceivable(
  row: FinanceProjectReceivableRow,
  tenantToday: string,
  remainingAmount: number,
) {
  return Boolean(
    row.due_date &&
      row.due_date < tenantToday &&
      remainingAmount > 0 &&
      row.status !== "paid",
  );
}

export const financeProjectSummaryRepository =
  new FinanceProjectSummaryRepository();
