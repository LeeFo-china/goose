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
  sourceRowCount: number;
  totalExpenseAmount: number;
  unallocatedExpenseAmount: number;
  byCategory: Map<string, number>;
};

export type ProjectCostBudgetCommitmentTotals = {
  sourceRowCount: number;
  totalCommitmentAmount: number;
  byCategory: Map<string, number>;
  categoryDetails: Map<string, {
    code: string | null;
    name: string | null;
  }>;
};

export type ProjectCostBudgetSupplierCostTotals = {
  sourceRowCount: number;
  totalSupplierCostAmount: number;
  byCategory: Map<string, number>;
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
    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "list_project_cost_expense_totals",
      {
        p_tenant_id: input.tenantId,
        p_project_id: input.projectId,
      },
    );

    if (error) {
      throw Errors.dbError("查询项目成本支出失败", error);
    }

    const { aggregate, sourceRowCount } = parseBoundedAggregate({
      data,
      parseErrorMessage: "解析项目成本支出失败",
      tooManyMessage: "项目支出流水过多，请使用成本汇总任务",
      tooManyCode: "PROJECT_COST_LEDGER_TOO_MANY_ROWS",
    });
    const categories = aggregate.categories;
    if (!Array.isArray(categories)) {
      throw Errors.dbError("解析项目成本支出失败", data);
    }
    const totalExpenseAmount = parseNonNegativeAggregateMoney(
      aggregate.total_expense_amount,
      "解析项目成本支出失败",
      data,
    );
    const unallocatedExpenseAmount = parseNonNegativeAggregateMoney(
      aggregate.unallocated_expense_amount,
      "解析项目成本支出失败",
      data,
    );
    const byCategory = new Map<string, number>();
    let categorizedExpenseAmount = 0;
    for (const value of categories) {
      const row = asRecord(value);
      if (!row || typeof row.cost_category_id !== "string") {
        throw Errors.dbError("解析项目成本支出失败", data);
      }
      const amount = parseNonNegativeAggregateMoney(
        row.expense_amount,
        "解析项目成本支出失败",
        data,
      );
      categorizedExpenseAmount += amount;
      byCategory.set(
        row.cost_category_id,
        (byCategory.get(row.cost_category_id) ?? 0) + amount,
      );
    }
    if (
      roundMoney(categorizedExpenseAmount + unallocatedExpenseAmount) !==
        totalExpenseAmount
    ) {
      throw Errors.dbError("解析项目成本支出失败", data);
    }

    return {
      sourceRowCount,
      totalExpenseAmount,
      unallocatedExpenseAmount,
      byCategory,
    };
  }

  async listCommitmentTotals(input: {
    tenantId: string;
    projectId: string;
  }): Promise<ProjectCostBudgetCommitmentTotals> {
    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "list_project_cost_commitment_totals",
      {
        p_tenant_id: input.tenantId,
        p_project_id: input.projectId,
      },
    );

    if (error) {
      throw Errors.dbError("查询项目采购预算承诺失败", error);
    }

    const { aggregate, sourceRowCount } = parseBoundedAggregate({
      data,
      parseErrorMessage: "解析项目采购预算承诺失败",
      tooManyMessage: "项目采购预算承诺过多，请使用成本汇总任务",
      tooManyCode: "PROJECT_COST_COMMITMENTS_TOO_MANY_ROWS",
    });
    const categories = aggregate.categories;
    if (!Array.isArray(categories)) {
      throw Errors.dbError("解析项目采购预算承诺失败", data);
    }

    const byCategory = new Map<string, number>();
    const categoryDetails = new Map<string, {
      code: string | null;
      name: string | null;
    }>();
    let totalCommitmentAmount = 0;
    for (const value of categories) {
      const row = asRecord(value);
      if (
        !row ||
        typeof row.cost_category_id !== "string" ||
        (row.category_code !== null && typeof row.category_code !== "string") ||
        (row.category_name !== null && typeof row.category_name !== "string")
      ) {
        throw Errors.dbError("解析项目采购预算承诺失败", data);
      }
      const amount = parseNonNegativeAggregateMoney(
        row.commitment_amount,
        "解析项目采购预算承诺失败",
        data,
      );
      totalCommitmentAmount += amount;
      byCategory.set(
        row.cost_category_id,
        (byCategory.get(row.cost_category_id) ?? 0) + amount,
      );
      categoryDetails.set(row.cost_category_id, {
        code: row.category_code,
        name: row.category_name,
      });
    }

    return {
      sourceRowCount,
      totalCommitmentAmount: roundMoney(totalCommitmentAmount),
      byCategory,
      categoryDetails,
    };
  }

  async listSupplierCostTotals(input: {
    tenantId: string;
    projectId: string;
  }): Promise<ProjectCostBudgetSupplierCostTotals> {
    const rows = await listSupplierCostEventRows(input);
    if (rows.length > 10_000) {
      throw Errors.business(
        422,
        "项目供应商成本事件过多，请使用成本汇总任务",
        "PROJECT_SUPPLIER_COST_EVENTS_TOO_MANY_ROWS",
      );
    }
    const byCategory = new Map<string, number>();
    let totalSupplierCostAmount = 0;
    for (const value of rows) {
      const row = asRecord(value);
      if (!row || typeof row.cost_category_id !== "string") {
        throw Errors.dbError("解析项目供应商实际成本失败", rows);
      }
      const amount = parseNonNegativeAggregateMoney(
        row.amount,
        "解析项目供应商实际成本失败",
        rows,
      );
      totalSupplierCostAmount += amount;
      byCategory.set(
        row.cost_category_id,
        roundMoney((byCategory.get(row.cost_category_id) ?? 0) + amount),
      );
    }
    return {
      sourceRowCount: rows.length,
      totalSupplierCostAmount: roundMoney(totalSupplierCostAmount),
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

async function listSupplierCostEventRows(input: {
  tenantId: string;
  projectId: string;
}): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; from <= 10_000; from += 1_000) {
    const to = Math.min(from + 999, 10_000);
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_cost_events")
      .select("cost_category_id,amount")
      .eq("tenant_id", input.tenantId)
      .eq("project_id", input.projectId)
      .range(from, to);
    if (error) {
      throw Errors.dbError("查询项目供应商实际成本失败", error);
    }
    if (!Array.isArray(data)) {
      throw Errors.dbError("解析项目供应商实际成本失败", data);
    }
    rows.push(...data);
    if (data.length < to - from + 1) break;
  }
  return rows;
}

function parseBoundedAggregate(input: {
  data: unknown;
  parseErrorMessage: string;
  tooManyMessage: string;
  tooManyCode: string;
}) {
  const aggregate = asRecord(input.data);
  const rawCount = aggregate?.source_row_count;
  const isValidNumber = typeof rawCount === "number" &&
    Number.isInteger(rawCount) && rawCount >= 0;
  const isValidString = typeof rawCount === "string" &&
    /^(0|[1-9]\d*)$/.test(rawCount);
  if (!aggregate || (!isValidNumber && !isValidString)) {
    throw Errors.dbError(input.parseErrorMessage, input.data);
  }

  const normalizedCount = String(rawCount);
  const exceedsLimit = typeof rawCount === "number"
    ? rawCount > 10_000
    : normalizedCount.length > 5 ||
      (normalizedCount.length === 5 && normalizedCount > "10000");
  if (exceedsLimit) {
    throw Errors.business(
      422,
      input.tooManyMessage,
      input.tooManyCode,
    );
  }
  return {
    aggregate,
    sourceRowCount: Number(normalizedCount),
  };
}

function parseNonNegativeAggregateMoney(
  value: unknown,
  errorMessage: string,
  details: unknown,
) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw Errors.dbError(errorMessage, details);
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw Errors.dbError(errorMessage, details);
  }
  return roundMoney(amount);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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
