import { describe, expect, mock, test } from "bun:test";

import { buildFinanceProjectSummaryAnalytics } from "./finance-project-summary-analytics";

describe("finance project trend cash calculation", () => {
  test("deducts supplier cash from net flow without reporting it as expense", async () => {
    const result = await buildFinanceProjectSummaryAnalytics({
      tenantId: "tenant-1",
      query: { page: 1, pageSize: 20 },
      repository: {
        listProjectsForAnalytics: mock(async () => ({
          list: [{
            id: "project-1",
            name: "项目",
            status: "constructing",
            signed_amount: 100,
            budget: 100,
          }],
          total: 1,
          limit: 100,
        })),
        listLedgerTrend: mock(async () => [{
          date: "2026-07-31",
          income_amount: 50,
          expense_amount: 10,
          supplier_cash_paid_amount: 20,
        }]),
      },
      buildSummaries: mock(async () => []),
    });

    expect(result.trends).toEqual([{
      date: "2026-07-31",
      income_amount: 50,
      expense_amount: 10,
      supplier_cash_paid_amount: 20,
      net_cash_flow_amount: 20,
    }]);
  });
});
