import { beforeEach, describe, expect, mock, test } from "bun:test";

let rows: unknown[] = [];
const calls: Array<{
  select: string;
  filters: Array<[string, unknown]>;
  orders: Array<[string, { ascending: boolean }]>;
  range: [number, number];
}> = [];

class SupplierCostReportQuery {
  private columns = "";
  private readonly filters: Array<[string, unknown]> = [];
  private readonly orders: Array<[string, { ascending: boolean }]> = [];

  select(columns: string) {
    this.columns = columns;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  order(column: string, options: { ascending: boolean }) {
    this.orders.push([column, options]);
    return this;
  }
  range(from: number, to: number) {
    calls.push({
      select: this.columns.replace(/\s+/g, " ").trim(),
      filters: [...this.filters],
      orders: [...this.orders],
      range: [from, to],
    });
    return Promise.resolve({
      data: rows.slice(from, to + 1),
      error: null,
    });
  }
}

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: (table: string) => {
        expect(table).toBe("project_cost_events");
        return new SupplierCostReportQuery();
      },
    }),
  },
}));

describe("finance operating report supplier cost query", () => {
  beforeEach(() => {
    calls.length = 0;
    rows = Array.from({ length: 1_001 }, (_, index) => ({
      id: `cost-${index}`,
      project_id: "project-1",
      cost_category_id: "category-1",
      amount: "0.01",
      occurred_at: "2026-06-10T10:00:00.000Z",
      project: {
        id: "project-1",
        name: "A 项目",
        status: "constructing",
      },
      cost_category: {
        id: "category-1",
        code: "material",
        name: "材料",
      },
    }));
  });

  test("pages tenant and report scoped costs with stable order", async () => {
    const { financeOperatingReportRepository } = await import(
      "./finance-operating-report"
    );
    const repository = financeOperatingReportRepository as unknown as {
      listSupplierCostRows(input: {
        tenantId: string;
        dateFrom: string;
        dateTo: string;
        projectId?: string;
        projectStatus?: string;
        sourceLimit: number;
      }): Promise<Array<{ amount: string; cost_category_name: string }>>;
    };

    const result = await repository.listSupplierCostRows({
      tenantId: "tenant-1",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      projectId: "project-1",
      projectStatus: "constructing",
      sourceLimit: 10_000,
    });

    expect(result).toHaveLength(1_001);
    expect(result[0]).toMatchObject({
      amount: "0.01",
      cost_category_name: "材料",
    });
    expect(calls.map((call) => call.range)).toEqual([
      [0, 999],
      [1_000, 1_999],
    ]);
    expect(calls[0]?.orders).toEqual([
      ["occurred_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
    expect(calls[0]?.filters).toEqual(expect.arrayContaining([
      ["tenant_id", "tenant-1"],
      ["occurred_at", "2026-06-01T00:00:00.000Z"],
      ["occurred_at", "2026-06-30T23:59:59.999Z"],
      ["project_id", "project-1"],
      ["project.status", "constructing"],
    ]));
    expect(calls[0]?.select).not.toContain("*");
    expect(calls[0]?.select).toContain("amount::text");
  });
});
