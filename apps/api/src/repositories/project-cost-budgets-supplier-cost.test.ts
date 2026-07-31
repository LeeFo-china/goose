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
  order(...args: unknown[]) {
    queryCalls.push({ method: "order", args });
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
      supplierCostRow("category-1", "25.50", "material", "材料"),
      supplierCostRow("category-1", "14.50", "material", "材料"),
      supplierCostRow("category-2", "8.00", "labor", "人工"),
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
        categoryDetails: Map<string, {
          code: string | null;
          name: string | null;
        }>;
      }>;
    };

    const result = await repository.listSupplierCostTotals({
      tenantId: "tenant-1",
      projectId: "project-1",
    });

    expect(queryCalls).toEqual([
      { method: "from", args: ["project_cost_events"] },
      {
        method: "select",
        args: [
          "id,cost_category_id,amount,created_at,cost_category:finance_cost_categories!project_cost_events_category_tenant_fkey(code,name)",
        ],
      },
      { method: "eq", args: ["tenant_id", "tenant-1"] },
      { method: "eq", args: ["project_id", "project-1"] },
      { method: "order", args: ["created_at", { ascending: true }] },
      { method: "order", args: ["id", { ascending: true }] },
      { method: "range", args: [0, 999] },
    ]);
    expect(result.totalSupplierCostAmount).toBe(48);
    expect([...result.byCategory.entries()]).toEqual([
      ["category-1", 40],
      ["category-2", 8],
    ]);
    expect([...result.categoryDetails.entries()]).toEqual([
      ["category-1", { code: "material", name: "材料" }],
      ["category-2", { code: "labor", name: "人工" }],
    ]);
  });

  test("pages past the PostgREST row cap without per-category queries", async () => {
    rows = Array.from({ length: 1_001 }, (_, index) => ({
      id: `event-${index}`,
      cost_category_id: index % 2 ? "category-1" : "category-2",
      amount: "1.00",
      created_at: "2026-07-31T00:00:00.000Z",
      cost_category: { code: "material", name: "材料" },
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
      id: "event-1",
      cost_category_id: "category-1",
      amount: "1.00",
      created_at: "2026-07-31T00:00:00.000Z",
      cost_category: { code: "material", name: "材料" },
    }));
    await expect(repository.listSupplierCostTotals(input)).rejects
      .toMatchObject({
        statusCode: 422,
        code: "PROJECT_SUPPLIER_COST_EVENTS_TOO_MANY_ROWS",
      });
  });

  test("aggregates cents exactly and rejects unsafe supplier cost totals", async () => {
    const { projectCostBudgetRepository } = await import(
      "./project-cost-budgets"
    );
    const input = { tenantId: "tenant-1", projectId: "project-1" };
    rows = [
      supplierCostRow("category-1", "0.01", "material", "材料"),
      supplierCostRow("category-1", "0.01", "material", "材料"),
      supplierCostRow("category-1", "0.01", "material", "材料"),
    ];

    const exact = await projectCostBudgetRepository.listSupplierCostTotals(
      input,
    );
    expect(exact.totalSupplierCostAmount).toBe(0.03);

    rows = [
      supplierCostRow(
        "category-1",
        "9999999999999999.99",
        "material",
        "材料",
      ),
    ];
    await expect(projectCostBudgetRepository.listSupplierCostTotals(input))
      .rejects.toMatchObject({
        statusCode: 422,
        code: "FINANCE_MONEY_EXCEEDS_SAFE_RANGE",
      });
  });
});

function supplierCostRow(
  costCategoryId: string,
  amount: string,
  code: string,
  name: string,
) {
  return {
    id: `event-${costCategoryId}-${amount}`,
    cost_category_id: costCategoryId,
    amount,
    created_at: "2026-07-31T00:00:00.000Z",
    cost_category: { code, name },
  };
}
