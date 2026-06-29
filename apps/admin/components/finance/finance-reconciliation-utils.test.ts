import { describe, expect, test } from "bun:test";
import {
  buildFinanceReconciliationSearchParams,
  financeReconciliationLevelMeta,
} from "./finance-reconciliation-utils";

describe("finance reconciliation helpers", () => {
  test("builds backend query params for reconciliation filters", () => {
    const params = buildFinanceReconciliationSearchParams({
      page: 2,
      pageSize: 20,
      date_from: "2026-06-01",
      date_to: "2026-06-30",
      exception_code: "payment_without_ledger",
      level: "danger",
      direction: "payment",
      project_id: "project-1",
    });

    expect(params.toString()).toBe(
      "page=2&pageSize=20&date_from=2026-06-01&date_to=2026-06-30&project_id=project-1&exception_code=payment_without_ledger&level=danger&direction=payment",
    );
  });

  test("maps reconciliation levels to badge labels", () => {
    expect(financeReconciliationLevelMeta("danger")).toEqual({
      label: "高风险",
      variant: "danger",
    });
    expect(financeReconciliationLevelMeta("warning")).toEqual({
      label: "预警",
      variant: "secondary",
    });
  });
});
