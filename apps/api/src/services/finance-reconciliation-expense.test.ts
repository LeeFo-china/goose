import { describe, expect, test } from "bun:test";
import type { FinanceReconciliationCandidateRows } from "@/repositories/finance-reconciliation";
import { buildFinanceReconciliationExceptions } from "./finance-reconciliation-exceptions";

const expenseCandidateRows = {
  receivables: [],
  payments: [],
  ledgers: [],
  expenseSettlements: [
    {
      id: "settlement-without-ledger",
      expense_request_id: "expense-without-ledger",
      project_id: "project-8",
      project_name: "费用未入账项目",
      title: "材料采购报销",
      paid_amount: 5000,
      paid_at: "2026-06-25T10:00:00.000Z",
      ledger_amount: 0,
    },
    {
      id: "settlement-mismatch",
      expense_request_id: "expense-mismatch",
      project_id: "project-10",
      project_name: "费用金额不一致项目",
      title: "安装费用报销",
      paid_amount: 8000,
      paid_at: "2026-06-27T10:00:00.000Z",
      ledger_amount: 6000,
    },
    {
      id: "settlement-clean",
      expense_request_id: "expense-clean",
      project_id: "project-11",
      project_name: "费用正常项目",
      title: "正常费用报销",
      paid_amount: 1200,
      paid_at: "2026-06-28T10:00:00.000Z",
      ledger_amount: 1200,
    },
  ],
  expenseLedgers: [
    {
      id: "expense-ledger-without-category",
      expense_request_id: "expense-uncategorized",
      expense_settlement_id: "settlement-uncategorized",
      project_id: "project-9",
      project_name: "未归集支出项目",
      amount: 3000,
      occurred_at: "2026-06-26T10:00:00.000Z",
      cost_category_id: null,
    },
    {
      id: "expense-ledger-clean",
      expense_request_id: "expense-clean",
      expense_settlement_id: "settlement-clean",
      project_id: "project-11",
      project_name: "费用正常项目",
      amount: 1200,
      occurred_at: "2026-06-28T10:00:00.000Z",
      cost_category_id: "category-1",
    },
  ],
} satisfies FinanceReconciliationCandidateRows;

describe("finance reconciliation expense exceptions", () => {
  test("builds expense settlement and cost category exceptions", () => {
    const result = buildFinanceReconciliationExceptions(
      expenseCandidateRows,
      "2026-06-30",
    );

    expect(result.map((item) => item.exception_code).sort()).toEqual([
      "expense_ledger_without_category",
      "expense_paid_amount_mismatch",
      "expense_paid_without_ledger",
    ]);
    expect(result).toContainEqual(
      expect.objectContaining({
        id: "settlement-without-ledger",
        exception_code: "expense_paid_without_ledger",
        exception_fingerprint:
          "expense_paid_without_ledger:settlement-without-ledger",
        subject_type: "expense_settlement",
        subject_id: "settlement-without-ledger",
        direction: "expense",
        level: "danger",
        amount: 5000,
        action: {
          key: "open_expense_ledger",
          label: "去处理",
          target:
            "/finance/ledger?project_id=project-8&direction=out&entry_type=expense_settlement&expense_request_id=expense-without-ledger&expense_settlement_id=settlement-without-ledger",
        },
      }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        id: "settlement-mismatch",
        exception_code: "expense_paid_amount_mismatch",
        subject_type: "expense_settlement",
        subject_id: "settlement-mismatch",
        direction: "expense",
        level: "danger",
        amount: 2000,
      }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        id: "expense-ledger-without-category",
        exception_code: "expense_ledger_without_category",
        subject_type: "ledger",
        subject_id: "expense-ledger-without-category",
        direction: "expense",
        level: "info",
        amount: 3000,
        action: {
          key: "open_unallocated_expense_ledger",
          label: "去处理",
          target:
            "/finance/ledger?project_id=project-9&direction=out&entry_type=expense_settlement&ledger_id=expense-ledger-without-category&unallocated_only=true",
        },
      }),
    );
  });
});
