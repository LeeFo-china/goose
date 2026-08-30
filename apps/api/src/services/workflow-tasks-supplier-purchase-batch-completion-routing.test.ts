import { expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

test("WorkflowTaskService routes supplier completion through the injected helper", async () => {
  const task = {
    id: "task-1",
    tenant_id: "tenant-1",
    instance_id: "instance-1",
    instance_node_id: "instance-node-1",
    definition_id: "definition-1",
    version_id: "version-1",
    node_id: "node-1",
    node_key: "purchase_review",
    node_type: "approval",
    title: "采购审批",
    status: "completed",
    assignee_employee_id: "employee-1",
    assignee_role_code: null,
    assignee_permission_code: null,
    due_at: null,
    completed_by: "employee-1",
    completed_at: "2026-08-30T08:00:00.000Z",
    created_at: "2026-08-30T07:00:00.000Z",
    updated_at: "2026-08-30T08:00:00.000Z",
    instance: {
      id: "instance-1",
      subject_type: "supplier_purchase_batch",
      subject_id: "batch-1",
      status: "completed",
      current_node_key: "approved_end",
      current_node_snapshot: { node_key: "approved_end" },
    },
  } as const;
  const findTask = mock(async () => task);
  const completeSupplierTask = mock(async () => ({
    status: "ordered",
    idempotent: true,
  }));
  const { WorkflowTaskService } = await import("./workflow-tasks");
  const service = new WorkflowTaskService({
    findTask,
    completeSupplierPurchaseBatchWorkflowTask: completeSupplierTask,
  });

  const result = await service.completeTask(
    authContext(),
    "task-1",
    { action: "approve", reason: null, output: { comment: "同意" } },
    "workflow-review-1",
  );

  expect(result).toEqual({ status: "ordered", idempotent: true });
  expect(findTask).toHaveBeenCalledWith({
    tenantId: "tenant-1",
    taskId: "task-1",
  });
  expect(completeSupplierTask).toHaveBeenCalledWith(expect.objectContaining({
    task: expect.objectContaining({
      id: "task-1",
      instance: expect.objectContaining({
        subject_type: "supplier_purchase_batch",
        subject_id: "batch-1",
      }),
    }),
    action: "approve",
    idempotencyKey: "workflow-review-1",
  }));
});

function authContext(): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId: "employee-1",
    tenantId: "tenant-1",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "审批人",
    employeeStatus: "active",
    roleCodes: [],
    roles: [],
    permissions: [],
    tenantName: null,
    tenantSlug: null,
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
  };
}
