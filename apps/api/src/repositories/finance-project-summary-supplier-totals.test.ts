import { beforeEach, describe, expect, mock, test } from "bun:test";

type ResponseState = { data: unknown[]; error: unknown };
const responses = new Map<string, ResponseState>();
const calls: Array<{
  table: string;
  select: string | null;
  filters: Array<[string, unknown]>;
  range: [number, number] | null;
}> = [];

class FactQuery {
  private selectColumns: string | null = null;
  private readonly filters: Array<[string, unknown]> = [];

  constructor(private readonly table: string) {}

  select(columns: string) {
    this.selectColumns = columns;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  in(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  range(from: number, to: number) {
    calls.push({
      table: this.table,
      select: this.selectColumns,
      filters: [...this.filters],
      range: [from, to],
    });
    const response = responses.get(this.table) ?? { data: [], error: null };
    return Promise.resolve({
      data: response.data.slice(from, to + 1),
      error: response.error,
    });
  }
}

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: (table: string) => new FactQuery(table),
    }),
  },
}));

describe("FinanceProjectSummaryRepository supplier totals", () => {
  beforeEach(() => {
    calls.length = 0;
    responses.clear();
    responses.set("finance_ledger_entries", {
      data: [
        projectRow("in", "project_payment", "50.00", "category-1"),
        projectRow("out", "expense_settlement", "10.00", null),
        projectRow("out", "supplier_payment", "20.00", null),
      ],
      error: null,
    });
    responses.set("project_cost_events", {
      data: [
        { project_id: "project-1", amount: "40.00" },
        { project_id: "project-2", amount: "7.00" },
      ],
      error: null,
    });
    responses.set("supplier_payable_events", {
      data: [
        { project_id: "project-1", amount: "100.00" },
        { project_id: "project-2", amount: "10.00" },
      ],
      error: null,
    });
    responses.set("supplier_payments", {
      data: [
        { project_id: "project-1", amount: "20.00" },
        { project_id: "project-2", amount: "3.00" },
      ],
      error: null,
    });
  });

  test("separates ledger cost from supplier cash and batches multiple projects", async () => {
    const { financeProjectSummaryRepository: repository } = await import(
      "./finance-project-summary"
    );
    const ledger = await repository.listLedgerTotals({
      tenantId: "tenant-1",
      projectIds: ["project-1", "project-2"],
    });
    const supplier = await (
      repository as unknown as {
        listSupplierTotals(input: {
          tenantId: string;
          projectIds: string[];
        }): Promise<Map<string, {
          supplier_cost_amount: number;
          supplier_payable_open_amount: number;
          supplier_cash_paid_amount: number;
        }>>;
      }
    ).listSupplierTotals({
      tenantId: "tenant-1",
      projectIds: ["project-1", "project-2"],
    });

    expect(ledger.get("project-1")).toMatchObject({
      income_amount: 50,
      expense_amount: 10,
      unallocated_expense_amount: 10,
      ledger_entry_count: 3,
    });
    expect(supplier.get("project-1")).toEqual({
      supplier_cost_amount: 40,
      supplier_payable_open_amount: 80,
      supplier_cash_paid_amount: 20,
    });
    expect(supplier.get("project-2")).toEqual({
      supplier_cost_amount: 7,
      supplier_payable_open_amount: 7,
      supplier_cash_paid_amount: 3,
    });
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.filters).toContainEqual(["tenant_id", "tenant-1"]);
      expect(call.filters).toContainEqual([
        "project_id",
        ["project-1", "project-2"],
      ]);
      expect(call.range).toEqual([0, 999]);
      expect(call.select).not.toContain("*");
    }
  });

  test("pages a batched project fact set past the PostgREST row cap", async () => {
    responses.set("project_cost_events", {
      data: Array.from({ length: 1_001 }, () => ({
        project_id: "project-1",
        amount: "1.00",
      })),
      error: null,
    });
    const { financeProjectSummaryRepository: repository } = await import(
      "./finance-project-summary"
    );

    const result = await repository.listSupplierTotals({
      tenantId: "tenant-1",
      projectIds: ["project-1"],
    });

    expect(result.get("project-1")?.supplier_cost_amount).toBe(1_001);
    expect(calls.filter((call) =>
      call.table === "project_cost_events"
    ).map((call) => call.range)).toEqual([
      [0, 999],
      [1_000, 1_999],
    ]);
  });

  test("returns early for an empty project set and rejects unsafe boundaries", async () => {
    const { financeProjectSummaryRepository: repository } = await import(
      "./finance-project-summary"
    );
    const target = repository as unknown as {
      listSupplierTotals(input: {
        tenantId: string;
        projectIds: string[];
      }): Promise<Map<string, unknown>>;
    };

    expect(await target.listSupplierTotals({
      tenantId: "tenant-1",
      projectIds: [],
    })).toEqual(new Map());
    expect(calls).toHaveLength(0);

    await expect(target.listSupplierTotals({
      tenantId: "tenant-1",
      projectIds: Array.from({ length: 101 }, (_, index) => `project-${index}`),
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  test("wraps query errors and refuses silent aggregate truncation", async () => {
    const { financeProjectSummaryRepository: repository } = await import(
      "./finance-project-summary"
    );
    const target = repository as unknown as {
      listSupplierTotals(input: {
        tenantId: string;
        projectIds: string[];
      }): Promise<unknown>;
    };
    responses.set("project_cost_events", {
      data: [],
      error: { code: "XX000" },
    });
    await expect(target.listSupplierTotals({
      tenantId: "tenant-1",
      projectIds: ["project-1"],
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    responses.set("project_cost_events", {
      data: Array.from({ length: 10_001 }, () => ({
        project_id: "project-1",
        amount: "1.00",
      })),
      error: null,
    });
    await expect(target.listSupplierTotals({
      tenantId: "tenant-1",
      projectIds: ["project-1"],
    })).rejects.toMatchObject({
      statusCode: 422,
      code: "FINANCE_PROJECT_SUPPLIER_FACTS_TOO_MANY_ROWS",
    });
  });
});

function projectRow(
  direction: string,
  entryType: string,
  amount: string,
  costCategoryId: string | null,
) {
  return {
    project_id: "project-1",
    direction,
    entry_type: entryType,
    amount,
    cost_category_id: costCategoryId,
  };
}
