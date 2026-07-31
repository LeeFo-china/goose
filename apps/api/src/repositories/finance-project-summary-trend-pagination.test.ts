import { beforeEach, describe, expect, mock, test } from "bun:test";

type TrendRow = ReturnType<typeof trendRow>;
let rows: TrendRow[] = [];
const calls: Array<{
  select: string;
  orders: Array<[string, { ascending: boolean }]>;
  range: [number, number];
}> = [];

class TrendQuery {
  private columns = "";
  private readonly orders: Array<[string, { ascending: boolean }]> = [];

  select(columns: string) {
    this.columns = columns;
    return this;
  }
  eq() {
    return this;
  }
  in() {
    return this;
  }
  gte() {
    return this;
  }
  order(column: string, options: { ascending: boolean }) {
    this.orders.push([column, options]);
    return this;
  }
  range(from: number, to: number) {
    calls.push({
      select: this.columns,
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
      from: () => new TrendQuery(),
    }),
  },
}));

describe("finance project ledger trend pagination", () => {
  beforeEach(() => {
    rows = [];
    calls.length = 0;
  });

  test("pages 1001 rows with stable order and exact supplier cash", async () => {
    rows = Array.from({ length: 1_001 }, (_, index) =>
      trendRow({
        id: `ledger-${index.toString().padStart(4, "0")}`,
        amount: "0.01",
        direction: index === 1_000 ? "out" : "in",
        entryType: index === 1_000
          ? "supplier_payment"
          : "project_payment",
      })
    );
    const { financeProjectSummaryRepository } = await import(
      "./finance-project-summary"
    );

    const result = await financeProjectSummaryRepository.listLedgerTrend({
      tenantId: "tenant-1",
      projectIds: ["project-1"],
      dateFrom: "2026-07-01",
    });

    expect(result).toEqual([{
      date: "2026-07-30",
      income_amount: 10,
      expense_amount: 0,
      supplier_cash_paid_amount: 0.01,
    }]);
    expect(calls.map((call) => call.range)).toEqual([
      [0, 999],
      [1_000, 1_999],
    ]);
    expect(calls[0]?.orders).toEqual([
      ["created_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
    expect(calls[0]?.select).toBe(
      "id,project_id,direction,entry_type,amount,occurred_at,created_at",
    );
  });

  test("rejects more than 10000 rows with a stable business code", async () => {
    rows = Array.from({ length: 10_001 }, (_, index) =>
      trendRow({ id: `ledger-${index}`, amount: "1.00" })
    );
    const { financeProjectSummaryRepository } = await import(
      "./finance-project-summary"
    );

    await expect(financeProjectSummaryRepository.listLedgerTrend({
      tenantId: "tenant-1",
      projectIds: ["project-1"],
      dateFrom: "2026-07-01",
    })).rejects.toMatchObject({
      statusCode: 422,
      code: "FINANCE_PROJECT_TREND_TOO_MANY_ROWS",
    });
    expect(calls.at(-1)?.range).toEqual([10_000, 10_000]);
  });

  test("returns early without querying an empty project scope", async () => {
    const { financeProjectSummaryRepository } = await import(
      "./finance-project-summary"
    );

    expect(await financeProjectSummaryRepository.listLedgerTrend({
      tenantId: "tenant-1",
      projectIds: [],
      dateFrom: "2026-07-01",
    })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

function trendRow(input: {
  id: string;
  amount: string;
  direction?: string;
  entryType?: string;
}) {
  return {
    id: input.id,
    project_id: "project-1",
    direction: input.direction ?? "out",
    entry_type: input.entryType ?? "expense_settlement",
    amount: input.amount,
    occurred_at: "2026-07-30T08:00:00.000Z",
    created_at: "2026-07-30T08:00:00.000Z",
  };
}
