import { describe, expect, test } from "bun:test";
import {
  buildFinanceMonthlyDifferenceSourcesSearchParams,
  financeDifferenceSourceTypeMeta,
  safeFinanceDifferenceSourceHref,
} from "./finance-difference-sources-utils";

describe("finance difference source helpers", () => {
  test("builds paginated backend query params", () => {
    const params = buildFinanceMonthlyDifferenceSourcesSearchParams({
      month: "2026-06",
      source_type: "ledger_entry",
      project_id: "00000000-0000-4000-8000-000000000001",
      page: 2,
      pageSize: 50,
    });

    expect(params.toString()).toBe(
      "month=2026-06&page=2&pageSize=50&source_type=ledger_entry&project_id=00000000-0000-4000-8000-000000000001",
    );
  });

  test("maps source types to display metadata", () => {
    expect(financeDifferenceSourceTypeMeta("correction_audit")).toEqual({
      label: "修正审计",
      variant: "warning",
    });
    expect(financeDifferenceSourceTypeMeta("ledger_entry")).toEqual({
      label: "财务台账",
      variant: "success",
    });
    expect(financeDifferenceSourceTypeMeta("unknown")).toEqual({
      label: "未知来源",
      variant: "outline",
    });
  });

  test("keeps only safe admin hrefs", () => {
    expect(safeFinanceDifferenceSourceHref("/finance/audits?month=2026-06"))
      .toBe("/finance/audits?month=2026-06");
    expect(safeFinanceDifferenceSourceHref("/expenses?expense_request_id=1"))
      .toBe("/expenses?expense_request_id=1");
    expect(safeFinanceDifferenceSourceHref("https://example.com"))
      .toBe("/finance/reports/difference-sources");
  });
});
