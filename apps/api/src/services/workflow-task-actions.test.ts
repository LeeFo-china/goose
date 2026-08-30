import { describe, expect, mock, test } from "bun:test";
import type { WorkflowTaskWithInstanceRow } from "@/repositories/workflow-tasks";
import { buildWorkflowTaskActionsForTask } from "./workflow-task-actions";

const paymentTask = {
  id: "task-1",
  tenant_id: "tenant-1",
  instance_id: "instance-1",
  instance_node_id: "node-run-1",
  definition_id: "definition-1",
  version_id: "version-1",
  node_id: "node-1",
  node_key: "payment_stage_2",
  node_type: "confirmation",
  title: "中期进度款",
  status: "pending",
  assignee_employee_id: null,
  assignee_role_code: null,
  assignee_permission_code: "finance.payment.confirm",
  due_at: null,
  completed_by: null,
  completed_at: null,
  created_at: "2026-06-16T09:00:00.000Z",
  updated_at: "2026-06-16T09:00:00.000Z",
  instance: {
    id: "instance-1",
    subject_type: "project",
    subject_id: "project-1",
    status: "running",
    current_node_key: "payment_stage_2",
    current_node_snapshot: {
      node_key: "payment_stage_2",
      node_type: "confirmation",
      business_kind: "payment_collection",
      title: "中期进度款",
      config: {
        payment_type: "stage_2",
        receivable_plan_enabled: true,
        receivable_amount_mode: "fixed_amount",
        receivable_fixed_amount: 10000,
      },
    },
  },
} satisfies WorkflowTaskWithInstanceRow;

const expenseFinanceReviewTask = {
  ...paymentTask,
  id: "expense-task-1",
  instance_id: "expense-instance-1",
  instance_node_id: "expense-node-run-1",
  node_id: "expense-node-1",
  node_key: "finance_review",
  node_type: "approval",
  title: "财务审批",
  assignee_employee_id: null,
  assignee_role_code: "finance_base",
  assignee_permission_code: "expense_request.approve_finance",
  instance: {
    id: "expense-instance-1",
    subject_type: "expense_request",
    subject_id: "expense-1",
    status: "running",
    current_node_key: "finance_review",
    current_node_snapshot: {
      node_key: "finance_review",
      node_type: "approval",
      business_kind: "expense_approval",
      title: "财务审批",
      config: {
        approval_type: "expense_approval",
        assignee_rule: "role",
        assignee_id: "finance_base",
        assignee_permission_code: "expense_request.approve_finance",
      },
    },
  },
} satisfies WorkflowTaskWithInstanceRow;

const supplierPurchaseReviewTask = {
  ...paymentTask,
  id: "supplier-task-1",
  instance_id: "supplier-instance-1",
  instance_node_id: "supplier-node-run-1",
  node_id: "supplier-node-1",
  node_key: "purchase_review",
  node_type: "approval",
  title: "采购审批",
  assignee_employee_id: null,
  assignee_role_code: null,
  assignee_permission_code: "supplier.purchase-requisition.approve",
  instance: {
    id: "supplier-instance-1",
    subject_type: "supplier_purchase_batch",
    subject_id: "batch-1",
    status: "running",
    current_node_key: "purchase_review",
    current_node_snapshot: {
      node_key: "purchase_review",
      node_type: "approval",
      title: "采购审批",
      config: {},
    },
  },
} satisfies WorkflowTaskWithInstanceRow;

describe("buildWorkflowTaskActionsForTask", () => {
  test("ensures receivable context for payment collection workflow tasks", async () => {
    const ensureWorkflowPaymentReceivableContext = mock(async () => ({
      receivable_plan_id: "plan-1",
      receivable_title: "中期进度款",
      receivable_amount: 10000,
      receivable_paid_amount: 3000,
      receivable_remaining_amount: 7000,
      receivable_due_date: "2026-06-30",
      receivable_status: "partially_paid",
      receivable_overdue_days: 0,
    }));

    const actions = await buildWorkflowTaskActionsForTask({
      tenantId: "tenant-1",
      subjectType: "project",
      task: paymentTask,
      receivablesService: {
        ensureWorkflowPaymentReceivableContext,
      },
    });

    expect(ensureWorkflowPaymentReceivableContext).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
      workflowInstanceId: "instance-1",
      workflowInstanceNodeId: "node-run-1",
      workflowNodeKey: "payment_stage_2",
      taskCreatedAt: "2026-06-16T09:00:00.000Z",
      nodeSnapshot: paymentTask.instance?.current_node_snapshot,
    });
    expect(actions[0]?.output_fields[0]).toMatchObject({
      name: "receivable_context",
      type: "receivable_summary",
      readonly: true,
      receivable_plan_id: "plan-1",
      receivable_remaining_amount: 7000,
    });
  });

  test("adds assignee display metadata to expense approval actions", async () => {
    const actions = await buildWorkflowTaskActionsForTask({
      tenantId: "tenant-1",
      subjectType: "expense_request",
      task: expenseFinanceReviewTask,
    });

    expect(actions[0]).toMatchObject({
      key: "approve",
      business_domain: "expense_request",
      assignee_type: "role_permission",
      assignee_display_name: "财务人员",
      assignee_role_code: "finance_base",
      assignee_permission_code: "expense_request.approve_finance",
      assignee_permission_name: "财务审批费用申请",
      current_handler_label: "等待财务人员审核",
    });
  });

  test("hides supplier actions for completed or stale tasks", async () => {
    const completedActions = await buildWorkflowTaskActionsForTask({
      tenantId: "tenant-1",
      subjectType: "supplier_purchase_batch",
      task: { ...supplierPurchaseReviewTask, status: "completed" },
    });
    const staleActions = await buildWorkflowTaskActionsForTask({
      tenantId: "tenant-1",
      subjectType: "supplier_purchase_batch",
      task: {
        ...supplierPurchaseReviewTask,
        instance: {
          ...supplierPurchaseReviewTask.instance,
          current_node_key: "finance_review",
        },
      },
    });

    expect(completedActions).toEqual([]);
    expect(staleActions).toEqual([]);
  });
});
