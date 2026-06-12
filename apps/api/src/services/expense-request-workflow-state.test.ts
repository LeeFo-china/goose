import { describe, expect, test } from "bun:test";
import type { WorkflowSubjectStateRow } from "@/repositories/workflow-subject-states";
import { attachExpenseWorkflowStatesFromRows } from "./expense-request-workflow-state";

function workflowState(
  subjectId: string,
  currentNodeKey: string,
): WorkflowSubjectStateRow {
  return {
    id: `state-${subjectId}`,
    tenant_id: "tenant-1",
    subject_type: "expense_request",
    subject_id: subjectId,
    definition_id: "definition-1",
    instance_id: `instance-${subjectId}`,
    instance_status: "running",
    current_node_key: currentNodeKey,
    current_node_title: currentNodeKey === "payment" ? "登记打款" : "审批",
    current_business_kind: "expense_approval",
    pending_task_count: 1,
    created_at: "2026-06-12T00:00:00.000Z",
    updated_at: "2026-06-12T00:00:00.000Z",
  };
}

describe("attachExpenseWorkflowStatesFromRows", () => {
  test("attaches workflow state by expense request id without changing order", () => {
    const rows = [
      { id: "expense-1", title: "材料费" },
      { id: "expense-2", title: "人工费" },
      { id: "expense-3", title: "差旅费" },
    ];

    expect(attachExpenseWorkflowStatesFromRows(rows, [
      workflowState("expense-2", "payment"),
      workflowState("expense-1", "manager_review"),
    ])).toEqual([
      {
        id: "expense-1",
        title: "材料费",
        workflow_state: workflowState("expense-1", "manager_review"),
      },
      {
        id: "expense-2",
        title: "人工费",
        workflow_state: workflowState("expense-2", "payment"),
      },
      {
        id: "expense-3",
        title: "差旅费",
        workflow_state: null,
      },
    ]);
  });
});
