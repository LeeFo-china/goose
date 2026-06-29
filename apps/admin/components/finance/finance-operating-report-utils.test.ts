import { describe, expect, test } from "bun:test";
import {
  buildFinanceOperatingReportSearchParams,
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
});
