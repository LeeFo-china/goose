import { describe, expect, test } from "bun:test";
import { resolveExpenseWorkflowTaskOperation } from "./workflow-task-expense-bridge";

describe("resolveExpenseWorkflowTaskOperation", () => {
  test("maps approval tasks to approve or reject operations", () => {
    expect(resolveExpenseWorkflowTaskOperation({
      nodeKey: "manager_review",
      action: "approve",
      reason: null,
      output: { comment: "ok" },
      employeeId: "employee-1",
    })).toEqual({
      kind: "approve",
      input: { approver_id: "employee-1", comment: "ok" },
    });

    expect(resolveExpenseWorkflowTaskOperation({
      nodeKey: "finance_review",
      action: "reject",
      reason: "票据不完整",
      output: { comment: "请补发票" },
      employeeId: "employee-2",
    })).toEqual({
      kind: "reject",
      input: {
        approver_id: "employee-2",
        rejected_reason: "票据不完整",
        reason: "票据不完整",
        comment: "请补发票",
      },
    });
  });

  test("maps payment task to pay operation with current employee default", () => {
    expect(resolveExpenseWorkflowTaskOperation({
      nodeKey: "payment",
      action: "pay",
      reason: null,
      output: {
        payee_name: "张三",
        method: "bank_transfer",
        paid_amount: 100,
        evidence_images: ["file-1"],
      },
      employeeId: "cashier-1",
    })).toEqual({
      kind: "pay",
      input: {
        payee_name: "张三",
        method: "bank_transfer",
        paid_amount: 100,
        paid_by: "cashier-1",
        evidence_images: ["file-1"],
      },
    });
  });
});
