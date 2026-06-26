import { describe, expect, test } from "bun:test";
import type { WorkflowTaskWithInstanceRow } from "@/repositories/workflow-tasks";
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

function workflowTask(
  subjectId: string,
  nodeKey: string,
  assignee: {
    employeeId?: string | null;
    employeeName?: string | null;
    roleCode?: string | null;
    permissionCode?: string | null;
  },
): WorkflowTaskWithInstanceRow {
  return {
    id: `task-${subjectId}`,
    tenant_id: "tenant-1",
    instance_id: `instance-${subjectId}`,
    instance_node_id: `instance-node-${subjectId}`,
    definition_id: "definition-1",
    version_id: "version-1",
    node_id: `node-${nodeKey}`,
    node_key: nodeKey,
    node_type: "approval",
    title: nodeKey === "payment" ? "出纳打款" : "财务审批",
    status: "pending",
    assignee_employee_id: assignee.employeeId ?? null,
    assignee_role_code: assignee.roleCode ?? null,
    assignee_permission_code: assignee.permissionCode ?? null,
    assignee_employee: assignee.employeeId
      ? {
        id: assignee.employeeId,
        name: assignee.employeeName ?? null,
        avatar: null,
      }
      : null,
    due_at: null,
    completed_by: null,
    completed_at: null,
    created_at: "2026-06-12T00:00:00.000Z",
    updated_at: "2026-06-12T00:00:00.000Z",
    instance: {
      id: `instance-${subjectId}`,
      subject_type: "expense_request",
      subject_id: subjectId,
      status: "running",
      current_node_key: nodeKey,
      current_node_snapshot: {
        node_key: nodeKey,
        business_kind: "expense_approval",
        title: nodeKey === "payment" ? "出纳打款" : "财务审批",
      },
    },
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
    ])).toMatchObject([
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

  test("adds current handler labels from pending workflow tasks", () => {
    const rows = [
      { id: "expense-1", title: "材料费" },
      { id: "expense-2", title: "人工费" },
    ];

    expect(attachExpenseWorkflowStatesFromRows(rows, [
      workflowState("expense-1", "finance_review"),
      workflowState("expense-2", "finance_review"),
    ], [
      workflowTask("expense-1", "finance_review", {
        roleCode: "finance_base",
        permissionCode: "expense_request.approve_finance",
      }),
      workflowTask("expense-2", "finance_review", {
        employeeId: "employee-1",
        employeeName: "小龙女",
      }),
    ])).toMatchObject([
      {
        id: "expense-1",
        current_handler_label: "等待财务人员审核",
        next_action_label: "等待财务人员审核",
        assignee_type: "role_permission",
        assignee_display_name: "财务人员",
      },
      {
        id: "expense-2",
        current_handler_label: "等待小龙女处理",
        next_action_label: "等待小龙女处理",
        assignee_type: "employee",
        assignee_display_name: "小龙女",
        assignee_employee_id: "employee-1",
      },
    ]);
  });
});
