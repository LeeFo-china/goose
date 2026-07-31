import { describe, expect, mock, test } from "bun:test";

const select = mock((columns: string) => {
  selectedColumns = columns;
  return query;
});
let selectedColumns = "";
const rows = [
  trendRow("in", "project_payment", "50.00", "2026-07-30T08:00:00.000Z"),
  trendRow("out", "expense_settlement", "10.00", "2026-07-30T09:00:00.000Z"),
  trendRow("out", "supplier_payment", "20.00", "2026-07-30T10:00:00.000Z"),
  trendRow("out", "supplier_payment", "5.00", "2026-07-31T10:00:00.000Z"),
];
const query = {
  select,
  eq: mock(() => query),
  in: mock(() => query),
  gte: mock(async () => ({ data: rows, error: null })),
};

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ from: mock(() => query) }),
  },
}));

describe("finance project ledger trend supplier payment", () => {
  test("keeps supplier cash out of expense while preserving cash outflow", async () => {
    const { financeProjectSummaryRepository } = await import(
      "./finance-project-summary"
    );

    const result = await financeProjectSummaryRepository.listLedgerTrend({
      tenantId: "tenant-1",
      projectIds: ["project-1"],
      dateFrom: "2026-07-01",
    });

    expect(selectedColumns).toBe(
      "project_id, direction, entry_type, amount, occurred_at",
    );
    expect(result).toEqual([
      {
        date: "2026-07-30",
        income_amount: 50,
        expense_amount: 10,
        supplier_cash_paid_amount: 20,
      },
      {
        date: "2026-07-31",
        income_amount: 0,
        expense_amount: 0,
        supplier_cash_paid_amount: 5,
      },
    ]);
  });
});

function trendRow(
  direction: string,
  entryType: string,
  amount: string,
  occurredAt: string,
) {
  return {
    project_id: "project-1",
    direction,
    entry_type: entryType,
    amount,
    occurred_at: occurredAt,
  };
}
