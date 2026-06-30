import { describe, expect, test } from "bun:test";
import {
  FinanceCostCategorySummaryQuerySchema,
  FinanceMonthlyOverviewDifferenceSourcesQuerySchema,
  FinanceMonthlyOverviewExportQuerySchema,
  FinanceMonthlyOverviewQuerySchema,
  FinanceProjectRankingQuerySchema,
  FinanceReceivableAgingQuerySchema,
  UpdateFinanceMonthlyDifferenceResolutionSchema,
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

describe("FinanceMonthlyOverviewDifferenceSourcesQuerySchema", () => {
  test("requires month and parses pagination filters", () => {
    expect(
      FinanceMonthlyOverviewDifferenceSourcesQuerySchema.parse({
        month: "2026-06",
        source_type: "ledger_entry",
        resolution_status: "confirmed",
        project_id: "00000000-0000-4000-8000-000000000001",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      month: "2026-06",
      source_type: "ledger_entry",
      resolution_status: "confirmed",
      project_id: "00000000-0000-4000-8000-000000000001",
      page: 2,
      pageSize: 50,
    });
  });

  test("rejects invalid source type, missing month, and oversized page", () => {
    expect(() =>
      FinanceMonthlyOverviewDifferenceSourcesQuerySchema.parse({
        source_type: "unknown",
      })
    ).toThrow();
    expect(() =>
      FinanceMonthlyOverviewDifferenceSourcesQuerySchema.parse({
        month: "2026-06",
        resolution_status: "unknown",
      })
    ).toThrow();
    expect(() =>
      FinanceMonthlyOverviewDifferenceSourcesQuerySchema.parse({
        month: "",
      })
    ).toThrow();
    expect(() =>
      FinanceMonthlyOverviewDifferenceSourcesQuerySchema.parse({
        month: "2026-06",
        pageSize: "101",
      })
    ).toThrow();
  });
});

describe("UpdateFinanceMonthlyDifferenceResolutionSchema", () => {
  test("parses a handled difference resolution", () => {
    expect(
      UpdateFinanceMonthlyDifferenceResolutionSchema.parse({
        month: "2026-06",
        source_type: "ledger_entry",
        source_id: "ledger-1",
        project_id: "00000000-0000-4000-8000-000000000001",
        status: "ignored",
        note: "已确认无需处理",
      }),
    ).toEqual({
      month: "2026-06",
      source_type: "ledger_entry",
      source_id: "ledger-1",
      project_id: "00000000-0000-4000-8000-000000000001",
      status: "ignored",
      note: "已确认无需处理",
    });
  });

  test("rejects pending writes and oversized notes", () => {
    expect(() =>
      UpdateFinanceMonthlyDifferenceResolutionSchema.parse({
        month: "2026-06",
        source_type: "ledger_entry",
        source_id: "ledger-1",
        status: "pending",
      })
    ).toThrow();
    expect(() =>
      UpdateFinanceMonthlyDifferenceResolutionSchema.parse({
        month: "2026-06",
        source_type: "ledger_entry",
        source_id: "",
        status: "confirmed",
      })
    ).toThrow();
    expect(() =>
      UpdateFinanceMonthlyDifferenceResolutionSchema.parse({
        month: "2026-06",
        source_type: "ledger_entry",
        source_id: "ledger-1",
        status: "confirmed",
        note: "x".repeat(501),
      })
    ).toThrow();
  });
});

describe("finance specialized report query schemas", () => {
  test("parses paginated project ranking filters", () => {
    expect(
      FinanceProjectRankingQuerySchema.parse({
        month: "2026-06",
        page: "2",
        pageSize: "50",
        sort_by: "gross_profit_rate",
        sort_order: "asc",
      }),
    ).toEqual({
      month: "2026-06",
      page: 2,
      pageSize: 50,
      sort_by: "gross_profit_rate",
      sort_order: "asc",
    });
  });

  test("caps specialized report page size", () => {
    expect(() =>
      FinanceProjectRankingQuerySchema.parse({
        pageSize: "101",
      })
    ).toThrow();
    expect(() =>
      FinanceCostCategorySummaryQuerySchema.parse({
        pageSize: "0",
      })
    ).toThrow();
  });

  test("parses receivable aging and csv export filters", () => {
    expect(
      FinanceReceivableAgingQuerySchema.parse({
        as_of: "2026-06-30",
        page: "1",
        pageSize: "20",
      }),
    ).toEqual({
      as_of: "2026-06-30",
      page: 1,
      pageSize: 20,
    });
    expect(
      FinanceMonthlyOverviewExportQuerySchema.parse({
        month: "2026-06",
        format: "csv",
      }),
    ).toEqual({
      month: "2026-06",
      format: "csv",
    });
  });
});
