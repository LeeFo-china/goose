import { describe, expect, mock, test } from "bun:test";

const listProjectSummariesByIds = mock(async () => [
  {
    id: "project-1",
    name: "郭富城 - 日出东方卓悦3期 1栋305设计项目",
    status: "constructing",
    address: "成都市高新区天府大道",
    property_label: "日出东方卓悦3期 1栋305",
    members: [
      { role_code: "designer", role_name: "主案设计", employee_id: "designer-1", employee_name: "阿紫" },
      { role_code: "construction_manager", role_name: "施工经理", employee_id: "manager-1", employee_name: "欧阳克" },
    ],
  },
]);

const listCustomerSummariesByIds = mock(async () => []);

const listExpenseRequestSummariesByIds = mock(async () => [
  {
    id: "expense-1",
    request_no: "FY20260627001",
    title: "6月采购铜线",
    mode: "reimbursement",
    total_amount: 1280,
    created_at: "2026-06-27T08:00:00.000Z",
    employee: { id: "employee-1", name: "黄蓉" },
    project: { id: "project-1", name: "郭富城 - 日出东方卓悦3期 1栋305设计项目" },
  },
]);

const listProjectReceivableSummaries = mock(async () => []);
const listProjectAcceptanceSummariesByProjectIds = mock(async () => []);
const repository = {
  listProjectSummariesByIds,
  listCustomerSummariesByIds,
  listExpenseRequestSummariesByIds,
  listProjectReceivableSummaries,
  listProjectAcceptanceSummariesByProjectIds,
};

describe("workflowTaskCardContextService", () => {
  test("builds project payment card context from project and receivable action data", async () => {
    const { WorkflowTaskCardContextService } = await import(
      "./workflow-task-card-context"
    );
    const workflowTaskCardContextService =
      new WorkflowTaskCardContextService(repository);

    const contexts = await workflowTaskCardContextService.buildTaskCardContextMap({
      tenantId: "tenant-1",
      items: [{
        task: {
          id: "task-payment",
          instance_id: "instance-1",
          instance_node_id: "instance-node-1",
          node_key: "payment_stage_2",
          node_type: "confirmation",
          title: "中期进度款",
          due_at: "2026-06-30T00:00:00.000Z",
          created_at: "2026-06-27T08:00:00.000Z",
          updated_at: "2026-06-27T08:00:00.000Z",
          assignee_employee_id: null,
          assignee_role_code: null,
          assignee_permission_code: "finance.payment.confirm",
          instance: {
            subject_type: "project",
            subject_id: "project-1",
            current_node_snapshot: {
              node_key: "payment_stage_2",
              business_kind: "payment_collection",
              title: "中期进度款",
            },
          },
        },
        actions: [{
          business_domain: "payment_collection",
          business_action: "confirm_payment",
          label: "中期进度款",
          output_fields: [{
            name: "receivable_context",
            label: "应收信息",
            type: "receivable_summary",
            required: false,
            readonly: true,
            receivable_plan_id: "receivable-1",
            receivable_title: "中期进度款",
            receivable_amount: 10000,
            receivable_paid_amount: 2000,
            receivable_remaining_amount: 8000,
            receivable_due_date: "2026-06-30",
            receivable_status: "pending",
            receivable_overdue_days: 0,
          }],
        }],
        assignee: {
          current_handler_label: "等待财务人员确认收款",
          assignee_display_name: "财务人员",
        },
      }],
    });

    expect(contexts.get("task-payment")).toMatchObject({
      todo_type: "project_payment",
      title: "中期进度款",
      subtitle: "郭富城 - 日出东方卓悦3期 1栋305设计项目 · 中期进度款",
      primary_meta: "日出东方卓悦3期 1栋305",
      secondary_meta: "等待财务人员确认收款",
      amount_text: "应收 ¥10,000.00 · 已收 ¥2,000.00 · 剩余 ¥8,000.00",
      people_text: "设计 阿紫 · 施工 欧阳克",
      project: {
        id: "project-1",
        name: "郭富城 - 日出东方卓悦3期 1栋305设计项目",
        property_label: "日出东方卓悦3期 1栋305",
      },
      business: {
        receivable_plan_id: "receivable-1",
        receivable_remaining_amount: 8000,
      },
    });
    expect(listProjectSummariesByIds).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectIds: ["project-1"],
    });
  });

  test("builds expense request card context with applicant, amount and project", async () => {
    const { WorkflowTaskCardContextService } = await import(
      "./workflow-task-card-context"
    );
    const workflowTaskCardContextService =
      new WorkflowTaskCardContextService(repository);

    const contexts = await workflowTaskCardContextService.buildTaskCardContextMap({
      tenantId: "tenant-1",
      items: [{
        task: {
          id: "task-expense",
          instance_id: "instance-expense",
          instance_node_id: "node-expense",
          node_key: "manager_review",
          node_type: "approval",
          title: "经理审批",
          due_at: null,
          created_at: "2026-06-27T08:00:00.000Z",
          updated_at: "2026-06-27T08:00:00.000Z",
          assignee_employee_id: null,
          assignee_role_code: null,
          assignee_permission_code: "expense_request.approve_manager",
          instance: {
            subject_type: "expense_request",
            subject_id: "expense-1",
            current_node_snapshot: {
              node_key: "manager_review",
              business_kind: "expense_approval",
              title: "经理审批",
            },
          },
        },
        actions: [{
          business_domain: "expense_request",
          business_action: "approve",
          label: "审批通过",
          output_fields: [],
        }],
        assignee: {
          current_handler_label: "等待部门经理审批",
          assignee_display_name: "部门经理",
        },
      }],
    });

    expect(contexts.get("task-expense")).toMatchObject({
      todo_type: "expense_request",
      title: "6月采购铜线",
      subtitle: "郭富城 - 日出东方卓悦3期 1栋305设计项目",
      primary_meta: "申请单 FY20260627001",
      secondary_meta: "等待部门经理审批",
      amount_text: "¥1,280.00",
      people_text: "申请人 黄蓉",
      applicant: {
        id: "employee-1",
        name: "黄蓉",
      },
      project: {
        id: "project-1",
        name: "郭富城 - 日出东方卓悦3期 1栋305设计项目",
      },
      business: {
        request_no: "FY20260627001",
        mode: "reimbursement",
      },
    });
    expect(listExpenseRequestSummariesByIds).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      expenseRequestIds: ["expense-1"],
    });
  });
});
