import { describe, expect, test } from "bun:test";

import {
  WorkflowSubjectTypeSchema,
  WorkflowTaskCompleteSchema,
  WorkflowTaskListQuerySchema,
} from "./workflow-subjects";

describe("workflow subject schemas", () => {
  test("accepts supplier purchase batch subjects", () => {
    expect(WorkflowSubjectTypeSchema.parse("supplier_purchase_batch"))
      .toBe("supplier_purchase_batch");
  });

  test("keeps task completion actions generic for approve and reject", () => {
    expect(WorkflowTaskCompleteSchema.parse({
      action: "approve",
      reason: "通过",
      output: { note: "采购审批" },
    })).toEqual({
      action: "approve",
      reason: "通过",
      output: { note: "采购审批" },
    });
    expect(WorkflowTaskCompleteSchema.parse({ action: "reject" }))
      .toEqual({ action: "reject", output: {} });
  });

  test("accepts supplier purchase batch filters for mini program todos", () => {
    expect(WorkflowTaskListQuerySchema.safeParse({
      status: "pending",
      subject_type: "supplier_purchase_batch",
      subject_id: "supplier-batch-1",
      page: 1,
      pageSize: 20,
    }).success).toBe(true);
  });
});
