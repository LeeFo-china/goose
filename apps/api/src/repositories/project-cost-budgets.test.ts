import { describe, expect, mock, test } from "bun:test";

const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
const updateCalls: unknown[] = [];
const insertCalls: unknown[] = [];
let commitmentRpcResponse: {
  data: unknown;
  error: unknown;
} = {
  data: {
    source_row_count: 1001,
    categories: [
      {
        cost_category_id: "category-1",
        category_code: "labor",
        category_name: "人工",
        commitment_amount: "1500.00",
      },
      {
        cost_category_id: "category-2",
        category_code: "main_material",
        category_name: "主材",
        commitment_amount: 500,
      },
    ],
  },
  error: null,
};
let expenseRpcResponse: {
  data: unknown;
  error: unknown;
} = {
  data: {
    source_row_count: 1001,
    total_expense_amount: "2000.00",
    unallocated_expense_amount: "200.00",
    categories: [
      { cost_category_id: "category-1", expense_amount: "1500.00" },
      { cost_category_id: "category-2", expense_amount: 300 },
    ],
  },
  error: null,
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

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: (table: string) => {
        expect(table).toBe("project_cost_budgets");
        return new ProjectCostBudgetsQuery();
      },
      rpc: async (name: string, params: Record<string, unknown>) => {
        rpcCalls.push({ name, params });
        if (name === "list_project_cost_commitment_totals") {
          return commitmentRpcResponse;
        }
        if (name === "list_project_cost_expense_totals") {
          return expenseRpcResponse;
        }
        return { data: null, error: null };
      },
    }),
  },
}));

describe("projectCostBudgetRepository", () => {
  test("loads 1001 expense rows and unallocated totals through one aggregate RPC", async () => {
    rpcCalls.length = 0;
    expenseRpcResponse = {
      data: {
        source_row_count: 1001,
        total_expense_amount: "2000.00",
        unallocated_expense_amount: "200.00",
        categories: [
          { cost_category_id: "category-1", expense_amount: "1500.00" },
          { cost_category_id: "category-2", expense_amount: 300 },
        ],
      },
      error: null,
    };
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );

    const result = await projectCostBudgetRepository.listExpenseTotals({
      tenantId: "tenant-1",
      projectId: "project-1",
    });

    expect(rpcCalls).toEqual([{
      name: "list_project_cost_expense_totals",
      params: {
        p_tenant_id: "tenant-1",
        p_project_id: "project-1",
      },
    }]);
    expect(result).toMatchObject({
      sourceRowCount: 1001,
      totalExpenseAmount: 2000,
      unallocatedExpenseAmount: 200,
    });
    expect([...result.byCategory.entries()]).toEqual([
      ["category-1", 1500],
      ["category-2", 300],
    ]);
  });

  test("accepts 10000 expense rows and rejects 10001", async () => {
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );
    expenseRpcResponse = {
      data: {
        source_row_count: 10_000,
        total_expense_amount: "0",
        unallocated_expense_amount: "0",
        categories: [],
      },
      error: null,
    };

    const accepted = await projectCostBudgetRepository.listExpenseTotals({
      tenantId: "tenant-1",
      projectId: "project-1",
    });
    expect(accepted.sourceRowCount).toBe(10_000);

    expenseRpcResponse = {
      data: {
        source_row_count: 10_001,
        total_expense_amount: "0",
        unallocated_expense_amount: "0",
        categories: [],
      },
      error: null,
    };
    await expect(
      projectCostBudgetRepository.listExpenseTotals({
        tenantId: "tenant-1",
        projectId: "project-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "PROJECT_COST_LEDGER_TOO_MANY_ROWS",
    });
  });

  test("wraps expense RPC and malformed aggregate failures as database errors", async () => {
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );
    expenseRpcResponse = {
      data: null,
      error: { message: "query failed" },
    };
    await expect(
      projectCostBudgetRepository.listExpenseTotals({
        tenantId: "tenant-1",
        projectId: "project-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "查询项目成本支出失败",
    });

    for (const invalidAmount of ["NaN", "Infinity", -1, null]) {
      expenseRpcResponse = {
        data: {
          source_row_count: 1,
          total_expense_amount: invalidAmount,
          unallocated_expense_amount: "0",
          categories: [],
        },
        error: null,
      };
      await expect(
        projectCostBudgetRepository.listExpenseTotals({
          tenantId: "tenant-1",
          projectId: "project-1",
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
      });
    }
  });

  test("loads more than PostgREST max_rows through one aggregate RPC", async () => {
    rpcCalls.length = 0;
    commitmentRpcResponse = {
      data: {
        source_row_count: 1001,
        categories: [
          {
            cost_category_id: "category-1",
            category_code: "labor",
            category_name: "人工",
            commitment_amount: "1500.00",
          },
          {
            cost_category_id: "category-2",
            category_code: "main_material",
            category_name: "主材",
            commitment_amount: 500,
          },
        ],
      },
      error: null,
    };
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );

    const result = await projectCostBudgetRepository.listCommitmentTotals({
      tenantId: "tenant-1",
      projectId: "project-1",
    });

    expect(rpcCalls).toEqual([
      {
        name: "list_project_cost_commitment_totals",
        params: {
          p_tenant_id: "tenant-1",
          p_project_id: "project-1",
        },
      },
    ]);
    expect(result.sourceRowCount).toBe(1001);
    expect(result.totalCommitmentAmount).toBe(2000);
    expect([...result.byCategory.entries()]).toEqual([
      ["category-1", 1500],
      ["category-2", 500],
    ]);
    expect(result.categoryDetails.get("category-2")).toEqual({
      code: "main_material",
      name: "主材",
    });
  });

  test("accepts the exact 10000 source row boundary", async () => {
    rpcCalls.length = 0;
    commitmentRpcResponse = {
      data: {
        source_row_count: 10_000,
        categories: [],
      },
      error: null,
    };
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );

    const result = await projectCostBudgetRepository.listCommitmentTotals({
      tenantId: "tenant-1",
      projectId: "project-1",
    });

    expect(result.sourceRowCount).toBe(10_000);
  });

  test("rejects commitment aggregation beyond the bounded row count", async () => {
    rpcCalls.length = 0;
    commitmentRpcResponse = {
      data: {
        source_row_count: 10_001,
        categories: [],
      },
      error: null,
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
    rpcCalls.length = 0;
    commitmentRpcResponse = {
      data: null,
      error: { message: "query failed" },
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

  test("rejects invalid or negative commitment aggregate amounts", async () => {
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );

    for (const invalidAmount of ["NaN", "Infinity", -1, null]) {
      commitmentRpcResponse = {
        data: {
          source_row_count: 1,
          categories: [{
            cost_category_id: "category-1",
            category_code: "labor",
            category_name: "人工",
            commitment_amount: invalidAmount,
          }],
        },
        error: null,
      };
      await expect(
        projectCostBudgetRepository.listCommitmentTotals({
          tenantId: "tenant-1",
          projectId: "project-1",
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
      });
    }
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
