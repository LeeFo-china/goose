import { describe, expect, test } from "bun:test";
import {
  CreateExpenseRequestSchema,
  ExpenseRequestListQuerySchema,
  SubmitExpenseRequestSchema,
  UpdateExpenseRequestSchema,
} from "./expense-requests";

describe("ExpenseRequestListQuerySchema", () => {
  test("does not expose legacy current_step filtering", () => {
    const result = ExpenseRequestListQuerySchema.safeParse({
      page: "1",
      pageSize: "20",
      current_step: "payment",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect("current_step" in result.data).toBe(false);
    }
  });
});

describe("expense request mutation schemas", () => {
  const approvalChain = [
    {
      step: "manager_review",
      assignee_id: "550e8400-e29b-41d4-a716-446655440000",
    },
  ];

  test("create input does not expose legacy approval_chain", () => {
    const result = CreateExpenseRequestSchema.safeParse({
      employee_id: "550e8400-e29b-41d4-a716-446655440001",
      project_id: null,
      mode: "reimbursement",
      items: [],
      approval_chain: approvalChain,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect("approval_chain" in result.data).toBe(false);
    }
  });

  test("update input does not expose legacy approval_chain", () => {
    const result = UpdateExpenseRequestSchema.safeParse({
      title: "更新标题",
      approval_chain: approvalChain,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect("approval_chain" in result.data).toBe(false);
    }
  });

  test("submit input does not expose legacy approval_chain", () => {
    const result = SubmitExpenseRequestSchema.safeParse({
      operator_id: "550e8400-e29b-41d4-a716-446655440002",
      comment: "提交",
      approval_chain: approvalChain,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect("approval_chain" in result.data).toBe(false);
    }
  });
});
