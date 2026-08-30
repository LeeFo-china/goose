import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

async function bridgeClass() {
  return (await import("@/services/workflow-task-supplier-purchase-batch-bridge"))
    .WorkflowTaskSupplierPurchaseBatchBridge;
}

const TENANT_ID = "b1000000-0000-4000-8000-000000000001";
const BATCH_ID = "b1000000-0000-4000-8000-000000000002";
const PROJECT_ID = "b1000000-0000-4000-8000-000000000003";
const TASK_ID = "b1000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "b1000000-0000-4000-8000-000000000005";
const USER_ID = "b1000000-0000-4000-8000-000000000006";

describe("WorkflowTaskSupplierPurchaseBatchBridge", () => {
  test("validates project access and delegates supplier review atomically", async () => {
    const WorkflowTaskSupplierPurchaseBatchBridge = await bridgeClass();
    const completeTask = mock(async () => ({ status: "ordered" }));
    const canAccessProject = mock(async () => true);
    const bridge = new WorkflowTaskSupplierPurchaseBatchBridge({
      repository: { completeTask },
      batchesRepository: { findBatch: mock(async () => batch()) },
      accessPolicy: {
        hasPermission: (auth, code) => auth.permissions.some((item) => item.code === code),
        canAccessProject,
      },
    });

    expect(await bridge.complete({
      authContext: auth(), task: task(), action: "approve", reason: null,
      output: { comment: "同意" }, idempotencyKey: "review-1",
    })).toEqual({ status: "ordered" });
    expect(canAccessProject).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: EMPLOYEE_ID }),
      PROJECT_ID,
      "project.read",
    );
    expect(canAccessProject).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: EMPLOYEE_ID }),
      PROJECT_ID,
      "supplier.purchase-requisition.approve",
    );
    expect(completeTask).toHaveBeenCalledWith({
      tenantId: TENANT_ID, batchId: BATCH_ID, taskId: TASK_ID,
      action: "approve", reason: null,
      output: { comment: "同意", reason: null },
      actorUserId: USER_ID, actorEmployeeId: EMPLOYEE_ID,
      idempotencyKey: "review-1",
    });
  });

  test("requires idempotency and a reject reason", async () => {
    const WorkflowTaskSupplierPurchaseBatchBridge = await bridgeClass();
    const completeTask = mock(async () => ({ status: "rejected" }));
    const bridge = new WorkflowTaskSupplierPurchaseBatchBridge({
      repository: { completeTask },
      batchesRepository: { findBatch: mock(async () => batch()) },
      accessPolicy: {
        hasPermission: () => true,
        canAccessProject: mock(async () => true),
      },
    });
    await expect(bridge.complete({
      authContext: auth(), task: task(), action: "approve", reason: null,
      output: {}, idempotencyKey: null,
    })).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    await expect(bridge.complete({
      authContext: auth(), task: task(), action: "reject", reason: "  ",
      output: {}, idempotencyKey: "review-1",
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(completeTask).not.toHaveBeenCalled();
  });

  test("fails closed for self review permission and project scope", async () => {
    const WorkflowTaskSupplierPurchaseBatchBridge = await bridgeClass();
    const completeTask = mock(async () => ({ status: "ordered" }));
    const canAccessProject = mock(async () => false);
    const batchesRepository = { findBatch: mock(async () => batch()) };
    const bridge = new WorkflowTaskSupplierPurchaseBatchBridge({
      repository: { completeTask }, batchesRepository,
      accessPolicy: { hasPermission: () => true, canAccessProject },
    });
    await expect(bridge.complete({
      authContext: auth(), task: task(), action: "approve", reason: null,
      output: {}, idempotencyKey: "review-1",
    })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    canAccessProject.mockImplementation(async () => true);
    batchesRepository.findBatch.mockImplementationOnce(async () => batch({
      submitted_by_employee_id: EMPLOYEE_ID,
    }));
    await expect(bridge.complete({
      authContext: auth(), task: task(), action: "approve", reason: null,
      output: {}, idempotencyKey: "review-2",
    })).rejects.toMatchObject({
      statusCode: 409, code: "SUPPLIER_PURCHASE_BATCH_SELF_REVIEW",
    });
    expect(completeTask).not.toHaveBeenCalled();
  });

  test("leaves unrelated workflow tasks on the generic path", async () => {
    const WorkflowTaskSupplierPurchaseBatchBridge = await bridgeClass();
    const completeTask = mock(async () => ({ status: "ordered" }));
    const bridge = new WorkflowTaskSupplierPurchaseBatchBridge({
      repository: { completeTask },
      batchesRepository: { findBatch: mock(async () => batch()) },
      accessPolicy: { hasPermission: () => true, canAccessProject: mock(async () => true) },
    });
    expect(await bridge.complete({
      authContext: auth(), task: { ...task(), node_key: "other" },
      action: "approve", reason: null, output: {}, idempotencyKey: null,
    })).toBeNull();
    expect(completeTask).not.toHaveBeenCalled();
  });
});

function task() {
  return {
    id: TASK_ID,
    tenant_id: TENANT_ID,
    node_key: "purchase_review",
    instance: { subject_id: BATCH_ID },
  };
}

function batch(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH_ID, tenant_id: TENANT_ID, project_id: PROJECT_ID,
    status: "pending_approval", version: 2, approval_round: 1,
    submitted_by_employee_id: "b1000000-0000-4000-8000-000000000099",
    ...overrides,
  };
}

function auth(): AuthContext {
  return {
    authUserId: USER_ID, employeeId: EMPLOYEE_ID, tenantId: TENANT_ID,
    tenantStatus: "active", isPlatformAdmin: false, employeeName: "审批人",
    employeeStatus: "active", roleCodes: [], roles: [], permissions: [
      { code: "supplier.purchase-requisition.view", scope: "all" },
      { code: "project.read", scope: "all" },
      { code: "supplier.purchase-requisition.approve", scope: "all" },
    ], tenantName: null, tenantSlug: null, departmentId: null,
    tenantDepartmentId: null, departmentCode: null, departmentName: null,
    postId: null, postName: null, avatar: null,
  };
}
