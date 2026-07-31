import { beforeEach, describe, expect, mock, test } from "bun:test";

const queryCalls: Array<{ method: string; args: unknown[] }> = [];
let rows: unknown[] = [];
let queryError: unknown = null;

class SupplierCostQuery {
  select(...args: unknown[]) {
    queryCalls.push({ method: "select", args });
    return this;
  }
  eq(...args: unknown[]) {
    queryCalls.push({ method: "eq", args });
    return this;
  }
  range(...args: unknown[]) {
    queryCalls.push({ method: "range", args });
    const [from, to] = args as [number, number];
    return Promise.resolve({
      data: rows.slice(from, to + 1),
      error: queryError,
    });
  }
}

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: (table: string) => {
        queryCalls.push({ method: "from", args: [table] });
        return new SupplierCostQuery();
      },
      rpc: mock(async () => ({ data: null, error: null })),
    }),
  },
}));

describe("projectCostBudgetRepository supplier cost totals", () => {
  beforeEach(() => {
    queryCalls.length = 0;
    queryError = null;
    rows = [
      { cost_category_id: "category-1", amount: "25.50" },
      { cost_category_id: "category-1", amount: "14.50" },
      { cost_category_id: "category-2", amount: "8.00" },
    ];
  });

  test("loads bounded tenant/project rows and aggregates every category", async () => {
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );
    const repository = projectCostBudgetRepository as unknown as {
      listSupplierCostTotals(input: {
        tenantId: string;
        projectId: string;
      }): Promise<{
        totalSupplierCostAmount: number;
        byCategory: Map<string, number>;
      }>;
    };

    const result = await repository.listSupplierCostTotals({
      tenantId: "tenant-1",
      projectId: "project-1",
    });

    expect(queryCalls).toEqual([
      { method: "from", args: ["project_cost_events"] },
      { method: "select", args: ["cost_category_id,amount"] },
      { method: "eq", args: ["tenant_id", "tenant-1"] },
      { method: "eq", args: ["project_id", "project-1"] },
      { method: "range", args: [0, 999] },
    ]);
    expect(result.totalSupplierCostAmount).toBe(48);
    expect([...result.byCategory.entries()]).toEqual([
      ["category-1", 40],
      ["category-2", 8],
    ]);
  });

  test("pages past the PostgREST row cap without per-category queries", async () => {
    rows = Array.from({ length: 1_001 }, (_, index) => ({
      cost_category_id: index % 2 ? "category-1" : "category-2",
      amount: "1.00",
    }));
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );

    const result = await projectCostBudgetRepository.listSupplierCostTotals({
      tenantId: "tenant-1",
      projectId: "project-1",
    });

    expect(result.totalSupplierCostAmount).toBe(1_001);
    expect(queryCalls.filter((call) => call.method === "range")).toEqual([
      { method: "range", args: [0, 999] },
      { method: "range", args: [1_000, 1_999] },
    ]);
  });

  test("wraps database failures and rejects malformed or excessive rows", async () => {
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );
    const repository = projectCostBudgetRepository as unknown as {
      listSupplierCostTotals(input: {
        tenantId: string;
        projectId: string;
      }): Promise<unknown>;
    };
    const input = { tenantId: "tenant-1", projectId: "project-1" };

    queryError = { code: "XX000" };
    await expect(repository.listSupplierCostTotals(input)).rejects
      .toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    queryError = null;
    rows = [{ cost_category_id: null, amount: "1.00" }];
    await expect(repository.listSupplierCostTotals(input)).rejects
      .toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    rows = Array.from({ length: 10_001 }, () => ({
      cost_category_id: "category-1",
      amount: "1.00",
    }));
    await expect(repository.listSupplierCostTotals(input)).rejects
      .toMatchObject({
        statusCode: 422,
        code: "PROJECT_SUPPLIER_COST_EVENTS_TOO_MANY_ROWS",
      });
  });
});
