import { Errors } from "@/errors/error-factory";
import type { SaveProjectCostBudgetsInput } from "@/schema/finance-costs";
import { SupabaseDB } from "@/utils/supabase/index";

const PROJECT_COST_BUDGET_SELECT = `
  id,
  tenant_id,
  project_id,
  cost_category_id,
  budget_amount,
  warning_threshold_percent,
  remark,
  status,
  created_at,
  updated_at,
  cost_category:finance_cost_categories(id, code, name, status, sort_order)
`;

export type ProjectCostBudgetCategory = {
  id: string;
  code: string;
  name: string;
  status: string | null;
  sort_order: number | null;
};

export type ProjectCostBudgetRecord = {
  id: string;
  tenant_id: string;
  project_id: string;
  cost_category_id: string;
  budget_amount: number | string | null;
  warning_threshold_percent: number | string | null;
  remark: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  cost_category?: ProjectCostBudgetCategory | null;
};

type ProjectCostBudgetRawRecord = Omit<ProjectCostBudgetRecord, "cost_category"> & {
  cost_category?: ProjectCostBudgetCategory | ProjectCostBudgetCategory[] | null;
};

export type ProjectCostBudgetExpenseTotals = {
  totalExpenseAmount: number;
  unallocatedExpenseAmount: number;
  byCategory: Map<string, number>;
};

type FinanceLedgerExpenseRow = {
  cost_category_id: string | null;
  amount: number | string | null;
};

class ProjectCostBudgetRepository {
  async findProject(input: {
    tenantId: string;
    projectId: string;
  }): Promise<{ id: string; tenant_id: string; name: string | null } | null> {
    const { data, error, count } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, tenant_id, name")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.projectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目归属失败", error);
    }

    return data as { id: string; tenant_id: string; name: string | null } | null;
  }

  async listActiveBudgets(input: {
    tenantId: string;
    projectId: string;
  }): Promise<ProjectCostBudgetRecord[]> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_cost_budgets")
      .select(PROJECT_COST_BUDGET_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("project_id", input.projectId)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询项目成本预算失败", error);
    }

    return ((data as unknown as ProjectCostBudgetRawRecord[] | null) || [])
      .map(normalizeProjectCostBudgetRecord);
  }

  async listExpenseTotals(input: {
    tenantId: string;
    projectId: string;
  }): Promise<ProjectCostBudgetExpenseTotals> {
    const { data, error, count } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select("cost_category_id, amount", { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .eq("project_id", input.projectId)
      .eq("direction", "out")
      .limit(10_000);

    if (error) {
      throw Errors.dbError("查询项目成本支出失败", error);
    }
    if ((count ?? 0) > 10_000) {
      throw Errors.business(
        422,
        "项目支出流水过多，请使用成本汇总任务",
        "PROJECT_COST_LEDGER_TOO_MANY_ROWS",
      );
    }

    const byCategory = new Map<string, number>();
    let totalExpenseAmount = 0;
    let unallocatedExpenseAmount = 0;
    for (const row of ((data as FinanceLedgerExpenseRow[] | null) || [])) {
      const amount = normalizeMoney(row.amount);
      totalExpenseAmount += amount;
      if (!row.cost_category_id) {
        unallocatedExpenseAmount += amount;
        continue;
      }

      byCategory.set(
        row.cost_category_id,
        (byCategory.get(row.cost_category_id) ?? 0) + amount,
      );
    }

    return {
      totalExpenseAmount: roundMoney(totalExpenseAmount),
      unallocatedExpenseAmount: roundMoney(unallocatedExpenseAmount),
      byCategory,
    };
  }

  async listActiveCategoriesByIds(input: {
    tenantId: string;
    categoryIds: string[];
  }): Promise<Array<{ id: string; code: string; name: string; status: string }>> {
    if (input.categoryIds.length === 0) {
      return [];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_cost_categories")
      .select("id, code, name, status")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active")
      .in("id", input.categoryIds);

    if (error) {
      throw Errors.dbError("查询成本分类失败", error);
    }

    return ((data as Array<{
      id: string;
      code: string;
      name: string;
      status: string;
    }> | null) || []);
  }

  async saveBudgets(input: {
    tenantId: string;
    projectId: string;
    employeeId: string;
    items: SaveProjectCostBudgetsInput["items"];
  }): Promise<ProjectCostBudgetRecord[]> {
    const { error } = await SupabaseDB.getAdminClient().rpc(
      "save_project_cost_budgets",
      {
        p_tenant_id: input.tenantId,
        p_project_id: input.projectId,
        p_employee_id: input.employeeId,
        p_items: input.items.map((item) => ({
          cost_category_id: item.cost_category_id,
          budget_amount: item.budget_amount,
          warning_threshold_percent: item.warning_threshold_percent ?? 100,
          remark: item.remark ?? null,
        })),
      },
    );
    if (error) {
      throw Errors.dbError("保存项目成本预算失败", error);
    }

    return this.listActiveBudgets({
      tenantId: input.tenantId,
      projectId: input.projectId,
    });
  }
}

function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? roundMoney(amount) : 0;
}

function normalizeProjectCostBudgetRecord(
  row: ProjectCostBudgetRawRecord,
): ProjectCostBudgetRecord {
  const category = Array.isArray(row.cost_category)
    ? row.cost_category[0] ?? null
    : row.cost_category ?? null;

  return {
    ...row,
    cost_category: category,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export const projectCostBudgetRepository =
  new ProjectCostBudgetRepository();
