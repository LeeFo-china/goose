import { describe, expect, test } from "bun:test";
import { buildProjectReconciliationChecks } from "./project-finance-reconciliation-summary-utils";

describe("project finance reconciliation summary", () => {
  test("builds reconciliation check items from backend summary", () => {
    const checks = buildProjectReconciliationChecks({
      project_id: "project-1",
      receivable_amount: 30000,
      received_amount: 28000,
      allocated_amount: 25000,
      ledger_income_amount: 28000,
      expense_paid_amount: 12000,
      ledger_expense_amount: 10000,
      exception_count: 2,
      danger_count: 1,
      warning_count: 1,
      latest_exception_at: "2026-06-30T00:00:00.000Z",
    });

    expect(checks.map((item) => [item.key, item.status])).toEqual([
      ["income_ledger", "success"],
      ["payment_allocation", "warning"],
      ["expense_ledger", "warning"],
      ["exceptions", "danger"],
    ]);
  });
});
