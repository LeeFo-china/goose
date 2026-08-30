import { expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import { completeSupplierPurchaseBatchWorkflowTask } from
  "@/services/workflow-task-supplier-purchase-batch-completion";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const supplierTask = {
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
  status: "pending",
  assignee_employee_id: "employee-1",
  assignee_role_code: null,
  assignee_permission_code: null,
  due_at: null,
  completed_by: null,
  completed_at: null,
  created_at: "2026-08-30T00:00:00.000Z",
  updated_at: "2026-08-30T00:00:00.000Z",
  instance: {
    id: "instance-1",
    subject_type: "supplier_purchase_batch",
    subject_id: "batch-1",
    status: "running",
    current_node_key: "purchase_review",
    current_node_snapshot: {},
  },
};

test("routes supplier purchase batches through the atomic bridge", async () => {
  const complete = mock(async () => ({ status: "ordered", idempotent: false }));
  const result = await completeSupplierPurchaseBatchWorkflowTask({
    authContext: authContext(), task: supplierTask,
    action: "approve", reason: null, output: {},
    idempotencyKey: " supplier-review-1 ",
  }, { complete });

  expect(result).toEqual({ status: "ordered", idempotent: false });
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({
    task: expect.objectContaining({ id: "task-1" }),
    action: "approve",
    idempotencyKey: " supplier-review-1 ",
  }));

  const realBridge = await createRealBridge();
  for (const idempotencyKey of [null, "", "   ", "x".repeat(121)]) {
    await expect(completeSupplierPurchaseBatchWorkflowTask({
      authContext: authContext(), task: supplierTask,
      action: "approve", reason: null, output: {}, idempotencyKey,
    }, realBridge)).rejects.toMatchObject({
      statusCode: 400, code: "VALIDATION_ERROR",
    });
  }
});

test("lets the atomic RPC decide completed supplier task replays", async () => {
  const complete = mock(async () => ({ status: "ordered", idempotent: true }));
  const completedTask = {
    ...supplierTask,
    status: "completed",
    instance: { ...supplierTask.instance, current_node_key: "approved_end" },
  };
  const result = await completeSupplierPurchaseBatchWorkflowTask({
    authContext: authContext(), task: completedTask,
    action: "approve", reason: null, output: {},
    idempotencyKey: "supplier-review-1",
  }, { complete });

  expect(result).toEqual({ status: "ordered", idempotent: true });
  expect(complete).toHaveBeenCalled();
});

async function createRealBridge() {
  const { WorkflowTaskSupplierPurchaseBatchBridge } = await import(
    "./workflow-task-supplier-purchase-batch-bridge"
  );
  return new WorkflowTaskSupplierPurchaseBatchBridge({
    repository: { completeTask: mock(async () => ({ status: "ordered" })) },
    batchesRepository: { findBatch: mock(async () => null) },
    accessPolicy: {
      hasPermission: mock(() => true),
      canAccessProject: mock(async () => true),
    },
  });
}

function authContext(): AuthContext {
  return {
    authUserId: "auth-1", employeeId: "employee-1", tenantId: "tenant-1",
    tenantStatus: "active", isPlatformAdmin: false, employeeName: "采购负责人",
    employeeStatus: "active", roleCodes: [], roles: [], permissions: [],
    tenantName: null, tenantSlug: null, departmentId: null,
    tenantDepartmentId: null, departmentCode: null, departmentName: null,
    postId: null, postName: null, avatar: null,
  };
}
