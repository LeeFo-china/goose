import { describe, expect, mock, test } from "bun:test";

const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
const updateCalls: unknown[] = [];
const insertCalls: unknown[] = [];
const commitmentQueryCalls: Array<{
  operation: string;
  args: unknown[];
}> = [];
let commitmentFromCount = 0;
let commitmentResponse: {
  data: unknown[] | null;
  error: unknown;
  count: number | null;
} = {
  data: [
    { cost_category_id: "category-1", amount: "1250.25" },
    { cost_category_id: "category-1", amount: "249.75" },
    { cost_category_id: "category-2", amount: 500 },
  ],
  error: null,
  count: 3,
};

const activeBudgetRows = [
  {
    id: "budget-1",
    tenant_id: "tenant-1",
    project_id: "project-1",
    cost_category_id: "category-1",
    budget_amount: 12002,
    warning_threshold_percent: 100,
    remark: "人工预算",
    status: "active",
    created_at: "2026-06-24T10:00:00.000Z",
    updated_at: "2026-06-24T10:10:00.000Z",
    cost_category: {
      id: "category-1",
      code: "labor",
      name: "人工",
      status: "active",
      sort_order: 10,
    },
  },
  {
    id: "budget-2",
    tenant_id: "tenant-1",
    project_id: "project-1",
    cost_category_id: "category-2",
    budget_amount: 8000,
    warning_threshold_percent: 100,
    remark: "主材预算",
    status: "active",
    created_at: "2026-06-24T10:00:00.000Z",
    updated_at: "2026-06-24T10:10:00.000Z",
    cost_category: {
      id: "category-2",
      code: "main_material",
      name: "主材",
      status: "active",
      sort_order: 20,
    },
  },
];

class ProjectCostBudgetsQuery {
  private operation: "select" | "update" | "insert" | null = null;
  private selectedColumns = "";

  select(columns: string) {
    this.operation = "select";
    this.selectedColumns = columns;
    return this;
  }

  eq() {
    return this;
  }

  in() {
    return this;
  }

  order() {
    return this;
  }

  update(patch: unknown) {
    this.operation = "update";
    updateCalls.push(patch);
    return this;
  }

  insert(rows: unknown) {
    this.operation = "insert";
    insertCalls.push(rows);
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    if (this.operation === "update" || this.operation === "insert") {
      return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
    }

    const data = this.selectedColumns === "id, cost_category_id"
      ? activeBudgetRows.map((row) => ({
        id: row.id,
        cost_category_id: row.cost_category_id,
      }))
      : activeBudgetRows;

    return Promise.resolve({ data, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

class ProjectCostCommitmentsQuery {
  select(columns: string, options?: unknown) {
    commitmentQueryCalls.push({
      operation: "select",
      args: [columns, options],
    });
    return this;
  }

  eq(column: string, value: unknown) {
    commitmentQueryCalls.push({
      operation: "eq",
      args: [column, value],
    });
    return this;
  }

  in(column: string, values: unknown[]) {
    commitmentQueryCalls.push({
      operation: "in",
      args: [column, values],
    });
    return this;
  }

  limit(value: number) {
    commitmentQueryCalls.push({
      operation: "limit",
      args: [value],
    });
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(commitmentResponse).then(onfulfilled, onrejected);
  }
}

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: (table: string) => {
        if (table === "project_cost_commitments") {
          commitmentFromCount += 1;
          return new ProjectCostCommitmentsQuery();
        }
        expect(table).toBe("project_cost_budgets");
        return new ProjectCostBudgetsQuery();
      },
      rpc: async (name: string, params: Record<string, unknown>) => {
        rpcCalls.push({ name, params });
        return { data: null, error: null };
      },
    }),
  },
}));

describe("projectCostBudgetRepository", () => {
  test("aggregates active purchase requisition commitments with one bounded query", async () => {
    commitmentQueryCalls.length = 0;
    commitmentFromCount = 0;
    commitmentResponse = {
      data: [
        { cost_category_id: "category-1", amount: "1250.25" },
        { cost_category_id: "category-1", amount: "249.75" },
        { cost_category_id: "category-2", amount: 500 },
      ],
      error: null,
      count: 3,
    };
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );

    const result = await projectCostBudgetRepository.listCommitmentTotals({
      tenantId: "tenant-1",
      projectId: "project-1",
    });

    expect(commitmentFromCount).toBe(1);
    expect(commitmentQueryCalls).toEqual([
      {
        operation: "select",
        args: ["cost_category_id, amount", { count: "exact" }],
      },
      { operation: "eq", args: ["tenant_id", "tenant-1"] },
      { operation: "eq", args: ["project_id", "project-1"] },
      {
        operation: "eq",
        args: ["source_type", "supplier_purchase_requisition"],
      },
      {
        operation: "in",
        args: ["status", ["reserved", "converted"]],
      },
      { operation: "limit", args: [10_000] },
    ]);
    expect(result.totalCommitmentAmount).toBe(2000);
    expect([...result.byCategory.entries()]).toEqual([
      ["category-1", 1500],
      ["category-2", 500],
    ]);
  });

  test("rejects commitment aggregation beyond the bounded row count", async () => {
    commitmentQueryCalls.length = 0;
    commitmentResponse = {
      data: [],
      error: null,
      count: 10_001,
    };
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );

    await expect(
      projectCostBudgetRepository.listCommitmentTotals({
        tenantId: "tenant-1",
        projectId: "project-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "PROJECT_COST_COMMITMENTS_TOO_MANY_ROWS",
    });
  });

  test("wraps commitment query failures as database errors", async () => {
    commitmentQueryCalls.length = 0;
    commitmentResponse = {
      data: null,
      error: { message: "query failed" },
      count: null,
    };
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );

    await expect(
      projectCostBudgetRepository.listCommitmentTotals({
        tenantId: "tenant-1",
        projectId: "project-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "查询项目采购预算承诺失败",
    });
  });

  test("saves all budget rows through one database RPC", async () => {
    rpcCalls.length = 0;
    updateCalls.length = 0;
    insertCalls.length = 0;
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );

    const result = await projectCostBudgetRepository.saveBudgets({
      tenantId: "tenant-1",
      projectId: "project-1",
      employeeId: "employee-1",
      items: [
        {
          cost_category_id: "category-1",
          budget_amount: 12002,
          warning_threshold_percent: 100,
          remark: "人工预算",
        },
        {
          cost_category_id: "category-2",
          budget_amount: 8000,
          warning_threshold_percent: 100,
          remark: "主材预算",
        },
      ],
    });

    expect(rpcCalls).toEqual([
      {
        name: "save_project_cost_budgets",
        params: {
          p_tenant_id: "tenant-1",
          p_project_id: "project-1",
          p_employee_id: "employee-1",
          p_items: [
            {
              cost_category_id: "category-1",
              budget_amount: 12002,
              warning_threshold_percent: 100,
              remark: "人工预算",
            },
            {
              cost_category_id: "category-2",
              budget_amount: 8000,
              warning_threshold_percent: 100,
              remark: "主材预算",
            },
          ],
        },
      },
    ]);
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
    expect(result).toHaveLength(2);
  });
});
