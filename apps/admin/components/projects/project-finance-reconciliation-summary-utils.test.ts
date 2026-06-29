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
      open_exception_count: 2,
      acknowledged_exception_count: 0,
      ignored_exception_count: 0,
      resolved_exception_count: 0,
      latest_exception_at: "2026-06-30T00:00:00.000Z",
      latest_action_at: null,
      latest_action_remark: null,
      latest_actor_employee_name: null,
    });

    expect(checks.map((item) => [item.key, item.status])).toEqual([
      ["income_ledger", "success"],
      ["payment_allocation", "warning"],
      ["expense_ledger", "warning"],
      ["exceptions", "danger"],
    ]);
  });

  test("marks exception check as success when all exceptions are closed", () => {
    const checks = buildProjectReconciliationChecks({
      project_id: "project-1",
      receivable_amount: 30000,
      received_amount: 28000,
      allocated_amount: 28000,
      ledger_income_amount: 28000,
      expense_paid_amount: 12000,
      ledger_expense_amount: 12000,
      exception_count: 2,
      danger_count: 1,
      warning_count: 1,
      open_exception_count: 0,
      acknowledged_exception_count: 0,
      ignored_exception_count: 1,
      resolved_exception_count: 1,
      latest_exception_at: "2026-06-30T00:00:00.000Z",
      latest_action_at: "2026-06-30T08:00:00.000Z",
      latest_action_remark: "已补齐凭证",
      latest_actor_employee_name: "财务",
    });

    expect(checks.find((item) => item.key === "exceptions")).toEqual(
      expect.objectContaining({
        status: "success",
        helper: "未处理 0 条 / 已解决 1 条",
      }),
    );
  });
});
