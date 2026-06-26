import { describe, expect, test } from "bun:test";
import { buildWorkflowTaskAssigneeMetadata } from "./workflow-task-assignee";

describe("buildWorkflowTaskAssigneeMetadata", () => {
  test("returns a concrete waiting label for employee assignees", () => {
    expect(buildWorkflowTaskAssigneeMetadata({
      node_key: "finance_review",
      assignee_employee_id: "employee-1",
      assignee_employee: {
        id: "employee-1",
        name: "小龙女",
        avatar: null,
      },
      assignee_role_code: null,
      assignee_permission_code: null,
    })).toMatchObject({
      assignee_type: "employee",
      assignee_display_name: "小龙女",
      current_handler_label: "等待小龙女处理",
      assignee_employee_id: "employee-1",
      assignee_employee_name: "小龙女",
    });
  });

  test("returns a finance review waiting label for role permission pools", () => {
    expect(buildWorkflowTaskAssigneeMetadata({
      node_key: "finance_review",
      assignee_employee_id: null,
      assignee_role_code: "finance_base",
      assignee_permission_code: "expense_request.approve_finance",
    })).toMatchObject({
      assignee_type: "role_permission",
      assignee_role_code: "finance_base",
      assignee_role_name: "财务",
      assignee_permission_code: "expense_request.approve_finance",
      assignee_permission_name: "财务审批费用申请",
      assignee_display_name: "财务人员",
      current_handler_label: "等待财务人员审核",
    });
  });

  test("returns a cashier waiting label for payment permission pools", () => {
    expect(buildWorkflowTaskAssigneeMetadata({
      node_key: "payment",
      assignee_employee_id: null,
      assignee_role_code: "finance_base",
      assignee_permission_code: "expense_request.pay",
    })).toMatchObject({
      assignee_type: "role_permission",
      assignee_display_name: "出纳",
      current_handler_label: "等待出纳打款",
    });
  });
});
