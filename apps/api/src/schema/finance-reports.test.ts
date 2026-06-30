import { describe, expect, test } from "bun:test";
import {
  FinanceMonthlyOverviewQuerySchema,
} from "@/schema/finance-reports";

describe("FinanceMonthlyOverviewQuerySchema", () => {
  test("accepts an optional YYYY-MM month", () => {
    expect(
      FinanceMonthlyOverviewQuerySchema.parse({ month: "2026-06" }),
    ).toEqual({ month: "2026-06" });
    expect(FinanceMonthlyOverviewQuerySchema.parse({})).toEqual({});
  });

  test("rejects invalid month values", () => {
    expect(() =>
      FinanceMonthlyOverviewQuerySchema.parse({ month: "2026-13" })
    ).toThrow();
    expect(() =>
      FinanceMonthlyOverviewQuerySchema.parse({ month: "2026-06-01" })
    ).toThrow();
  });
});
