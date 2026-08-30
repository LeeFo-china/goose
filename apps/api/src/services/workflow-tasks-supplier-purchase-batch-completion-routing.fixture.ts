import assert from "node:assert/strict";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const task = {
  id: "task-1", tenant_id: "tenant-1", instance_id: "instance-1",
  instance_node_id: "instance-node-1", definition_id: "definition-1",
  version_id: "version-1", node_id: "node-1", node_key: "purchase_review",
  node_type: "approval", title: "采购审批", status: "completed",
  assignee_employee_id: "employee-1", assignee_role_code: null,
  assignee_permission_code: null, due_at: null, completed_by: "employee-1",
  completed_at: "2026-08-30T08:00:00.000Z",
  created_at: "2026-08-30T07:00:00.000Z",
  updated_at: "2026-08-30T08:00:00.000Z",
  instance: {
    id: "instance-1", subject_type: "supplier_purchase_batch",
    subject_id: "batch-1", status: "completed", current_node_key: "approved_end",
    current_node_snapshot: { node_key: "approved_end" },
  },
} as const;
async function main(): Promise<void> {
  const calls: unknown[] = [];
  const { WorkflowTaskService } = await import("./workflow-tasks");
  const service = new WorkflowTaskService({
    findTask: async (input) => {
      calls.push(input);
      return task;
    },
    completeSupplierPurchaseBatchWorkflowTask: async (input) => {
      calls.push(input);
      return { status: "ordered", idempotent: true } as never;
    },
  });

  const result = await service.completeTask(
    authContext(), "task-1",
    { action: "approve", reason: null, output: { comment: "同意" } },
    "workflow-review-1",
  );
  assert.deepEqual(result, { status: "ordered", idempotent: true });
  assert.deepEqual(calls[0], { tenantId: "tenant-1", taskId: "task-1" });
  assert.equal((calls[1] as { task: { id: string } }).task.id, "task-1");
  assert.equal(
    (calls[1] as { idempotencyKey: string }).idempotencyKey,
    "workflow-review-1",
  );
  console.log("WORKFLOW_TASK_SUPPLIER_ROUTING_OK");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

function authContext(): AuthContext {
  return {
    authUserId: "auth-1", employeeId: "employee-1", tenantId: "tenant-1",
    tenantStatus: "active", isPlatformAdmin: false, employeeName: "审批人",
    employeeStatus: "active", roleCodes: [], roles: [], permissions: [],
    tenantName: null, tenantSlug: null, departmentId: null,
    tenantDepartmentId: null, departmentCode: null, departmentName: null,
    postId: null, postName: null, avatar: null,
  };
}
