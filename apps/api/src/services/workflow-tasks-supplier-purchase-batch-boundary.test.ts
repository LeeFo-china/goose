import { expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

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
const completeRuntimeNode = mock(async () => ({ ok: true as const }));
const assertRuntimeNodeCompletionAllowed = mock(async () => undefined);
const completeSupplierPurchaseBatchBridge = mock(async () => ({
  status: "ordered",
  idempotent: false,
}));
const findById = mock(async () => supplierTask);

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    findById,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getRuntimeInstanceById: mock(async () => ({
      ...supplierTask.instance,
      current_node_id: "node-1",
      version_id: "version-1",
    })),
    getGraph: mock(async () => ({ definition: {}, nodes: [], edges: [] })),
    completeRuntimeNode,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantId: mock(() => "tenant-1"),
  },
}));

mock.module("@/services/workflow-runtime-guards", () => ({
  assertRuntimeNodeCompletionAllowed,
}));

mock.module("@/services/workflow-task-supplier-purchase-batch-bridge", () => ({
  workflowTaskSupplierPurchaseBatchBridge: {
    complete: completeSupplierPurchaseBatchBridge,
  },
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    syncFromRuntimeInstance: mock(async () => null),
  },
}));

test("routes supplier purchase batches through the atomic bridge", async () => {
  const { workflowTaskService } = await import("./workflow-tasks");

  const result = await workflowTaskService.completeTask(
    authContext(),
    "task-1",
    {
      action: "approve",
      reason: null,
      output: {
        decision: "approved",
        budget_status: "within_budget",
      },
    },
    "supplier-review-1",
  );

  expect(result).toEqual({ status: "ordered", idempotent: false });
  expect(completeSupplierPurchaseBatchBridge).toHaveBeenCalledWith(
    expect.objectContaining({
      task: expect.objectContaining({ id: "task-1" }),
      action: "approve",
      idempotencyKey: "supplier-review-1",
    }),
  );
  expect(assertRuntimeNodeCompletionAllowed).not.toHaveBeenCalled();
  expect(completeRuntimeNode).not.toHaveBeenCalled();
});

test("lets the atomic RPC decide completed supplier task replays", async () => {
  const { workflowTaskService } = await import("./workflow-tasks");
  findById.mockImplementationOnce(async () => ({
    ...supplierTask,
    status: "completed",
    instance: { ...supplierTask.instance, current_node_key: "approved_end" },
  }));
  completeSupplierPurchaseBatchBridge.mockImplementationOnce(async () => ({
    status: "ordered",
    idempotent: true,
  }));

  const result = await workflowTaskService.completeTask(
    authContext(),
    "task-1",
    { action: "approve", reason: null, output: {} },
    "supplier-review-1",
  );

  expect(result).toEqual({ status: "ordered", idempotent: true });
  expect(completeSupplierPurchaseBatchBridge).toHaveBeenCalled();
  expect(completeRuntimeNode).not.toHaveBeenCalled();
});

function authContext(): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId: "employee-1",
    tenantId: "tenant-1",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "采购负责人",
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
