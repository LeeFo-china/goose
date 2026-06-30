import { describe, expect, test } from "bun:test";
import {
  buildFinanceCostCategorySummarySearchParams,
  buildFinanceMonthlyOverviewSearchParams,
  buildFinanceOperatingReportSearchParams,
  buildFinanceProjectRankingSearchParams,
  buildFinanceReceivableAgingSearchParams,
  financeClosingStatusLabel,
  financeOperatingGroupByLabel,
} from "./finance-operating-report-utils";

describe("finance operating report helpers", () => {
  test("builds backend query params for operating reports", () => {
    const params = buildFinanceOperatingReportSearchParams({
      date_from: "2026-06-01",
      date_to: "2026-06-30",
      group_by: "project",
      project_id: "project-1",
      project_status: "constructing",
    });

    expect(params.toString()).toBe(
      "date_from=2026-06-01&date_to=2026-06-30&group_by=project&project_id=project-1&project_status=constructing",
    );
  });

  test("maps group_by values to labels", () => {
    expect(financeOperatingGroupByLabel("month")).toBe("按月份");
    expect(financeOperatingGroupByLabel("cost_category")).toBe("按成本分类");
  });

  test("builds backend query params for monthly overview", () => {
    const params = buildFinanceMonthlyOverviewSearchParams({
      month: "2026-06",
    });

    expect(params.toString()).toBe("month=2026-06");
  });

  test("maps closing statuses to labels", () => {
    expect(financeClosingStatusLabel("not_started")).toBe("未结账");
    expect(financeClosingStatusLabel("draft")).toBe("草稿");
    expect(financeClosingStatusLabel("closed")).toBe("已结账");
    expect(financeClosingStatusLabel("reopened")).toBe("已反结账");
  });

  test("builds specialized report query params", () => {
    expect(
      buildFinanceProjectRankingSearchParams({
        month: "2026-06",
        page: 2,
        pageSize: 50,
        sort_by: "gross_profit_rate",
        sort_order: "asc",
      }).toString(),
    ).toBe(
      "month=2026-06&page=2&pageSize=50&sort_by=gross_profit_rate&sort_order=asc",
    );
    expect(
      buildFinanceCostCategorySummarySearchParams({
        month: "2026-06",
        sort_by: "expense_amount",
      }).toString(),
    ).toBe("month=2026-06&sort_by=expense_amount");
    expect(
      buildFinanceReceivableAgingSearchParams({
        as_of: "2026-06-30",
        page: 1,
      }).toString(),
    ).toBe("as_of=2026-06-30&page=1");
  });
});
