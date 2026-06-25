import { describe, expect, test } from "bun:test";
import { FinanceProjectSummaryListQuerySchema } from "@/schema/finance";

describe("FinanceProjectSummaryListQuerySchema", () => {
  test("parses finance project risk filter query", () => {
    const parsed = FinanceProjectSummaryListQuerySchema.parse({
      page: "2",
      pageSize: "50",
      risk_level: "warning",
      risk_flag: "unallocated_expense",
      budget_configured: "false",
      has_unallocated_expense: "true",
      overdue: "true",
      min_budget_usage_ratio: "0.8",
      max_projected_budget_gross_margin: "0.2",
    });

    expect(parsed).toMatchObject({
      page: 2,
      pageSize: 50,
      risk_level: "warning",
      risk_flag: "unallocated_expense",
      budget_configured: false,
      has_unallocated_expense: true,
      overdue: true,
      min_budget_usage_ratio: 0.8,
      max_projected_budget_gross_margin: 0.2,
    });
  });
});
