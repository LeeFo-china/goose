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
const INSTANCE_ID = "b1000000-0000-4000-8000-000000000007";

function dependencies(overrides: Record<string, unknown> = {}) {
  const listRunningInstances = mock(
    async (): Promise<Array<ReturnType<typeof instance>>> => [instance()],
  );
  const listPendingTasks = mock(
    async (): Promise<Array<ReturnType<typeof pendingTask>>> => [pendingTask()],
  );
  return {
    repository: { completeTask: mock(async () => ({ status: "ordered" })) },
    batchesRepository: { findBatchAccessContext: mock(async () => batch()) },
    lookupRepository: { listRunningInstances, listPendingTasks },
    accessPolicy: {
      hasPermission: (context: AuthContext, code: string) =>
        context.permissions.some((item) => item.code === code),
      canAccessProject: mock(async () => true),
    },
    ...overrides,
  };
}

describe("WorkflowTaskSupplierPurchaseBatchBridge", () => {
  test("validates project access and delegates supplier review atomically", async () => {
    const WorkflowTaskSupplierPurchaseBatchBridge = await bridgeClass();
    const completeTask = mock(async () => ({ status: "ordered" }));
    const canAccessProject = mock(async () => true);
    const bridge = new WorkflowTaskSupplierPurchaseBatchBridge({
      repository: { completeTask },
      batchesRepository: { findBatchAccessContext: mock(async () => batch()) },
      accessPolicy: {
        hasPermission: (auth, code) => auth.permissions.some((item) => item.code === code),
        canAccessProject,
      },
    });

    expect(await bridge.complete({
      authContext: auth(), task: task(), action: "approve", reason: null,
      output: { comment: "同意" }, idempotencyKey: " review-1 ",
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
      batchesRepository: { findBatchAccessContext: mock(async () => batch()) },
      accessPolicy: {
        hasPermission: () => true,
        canAccessProject: mock(async () => true),
      },
    });
    for (const idempotencyKey of [null, "", "   ", "x".repeat(121)]) {
      await expect(bridge.complete({
        authContext: auth(), task: task(), action: "approve", reason: null,
        output: {}, idempotencyKey,
      })).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    }
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
    const batchesRepository = {
      findBatchAccessContext: mock(async () => batch()),
    };
    const bridge = new WorkflowTaskSupplierPurchaseBatchBridge({
      repository: { completeTask }, batchesRepository,
      accessPolicy: { hasPermission: () => true, canAccessProject },
    });
    await expect(bridge.complete({
      authContext: auth(), task: task(), action: "approve", reason: null,
      output: {}, idempotencyKey: "review-1",
    })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    canAccessProject.mockImplementation(async () => true);
    batchesRepository.findBatchAccessContext.mockImplementationOnce(
      async () => batch({ submitted_by_employee_id: EMPLOYEE_ID }),
    );
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
      batchesRepository: { findBatchAccessContext: mock(async () => batch()) },
      accessPolicy: { hasPermission: () => true, canAccessProject: mock(async () => true) },
    });
    expect(await bridge.complete({
      authContext: auth(), task: { ...task(), node_key: "other" },
      action: "approve", reason: null, output: {}, idempotencyKey: null,
    })).toBeNull();
    expect(completeTask).not.toHaveBeenCalled();
  });

  test("resolves the unique current task and delegates legacy review", async () => {
    const WorkflowTaskSupplierPurchaseBatchBridge = await bridgeClass();
    const deps = dependencies();
    deps.repository.completeTask.mockImplementation(async () => ({
      status: "pending_approval",
      workflow_state: { current_node_key: "finance_review" },
    }));
    const bridge = new WorkflowTaskSupplierPurchaseBatchBridge(deps);

    const result = await bridge.completeLegacyReview({
      authContext: auth(),
      batch: batch({ approval_round: 3 }),
      action: "approve",
      reason: "同意",
      output: { compat_source: "supplier_purchase_batch_review" },
      idempotencyKey: "legacy-review-1",
    });

    expect(result).toEqual({
      status: "pending_approval",
      workflow_state: { current_node_key: "finance_review" },
    });
    expect(deps.repository.completeTask).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      batchId: BATCH_ID,
      taskId: TASK_ID,
      action: "approve",
      reason: "同意",
      output: {
        compat_source: "supplier_purchase_batch_review",
        reason: "同意",
      },
      actorUserId: USER_ID,
      actorEmployeeId: EMPLOYEE_ID,
      idempotencyKey: "legacy-review-1",
    });
  });

  test.each([
    [[], [pendingTask()], "SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING"],
    [[instance(), instance({ id: USER_ID })], [pendingTask()],
      "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT"],
    [[instance()], [], "SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING"],
    [[instance()], [pendingTask(), pendingTask({ id: USER_ID })],
      "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT"],
    [[instance({ current_node_key: "finance_review" })], [pendingTask()],
      "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT"],
  ] as const)(
    "fails closed for a non-unique workflow resolution %#",
    async (runningInstances, pendingTasks, code) => {
      const WorkflowTaskSupplierPurchaseBatchBridge = await bridgeClass();
      const deps = dependencies();
      deps.lookupRepository.listRunningInstances
        .mockImplementation(async () => [...runningInstances]);
      deps.lookupRepository.listPendingTasks
        .mockImplementation(async () => [...pendingTasks]);
      const bridge = new WorkflowTaskSupplierPurchaseBatchBridge(deps);

      await expect(bridge.completeLegacyReview({
        authContext: auth(), batch: batch(), action: "approve", reason: null,
        output: { compat_source: "supplier_purchase_batch_review" },
        idempotencyKey: "legacy-review-resolution",
      })).rejects.toMatchObject({ statusCode: 409, code });
      expect(deps.repository.completeTask).not.toHaveBeenCalled();
    },
  );

  test("rejects stale approval rounds and a non-assignee without fallback", async () => {
    const WorkflowTaskSupplierPurchaseBatchBridge = await bridgeClass();
    const deps = dependencies();
    const bridge = new WorkflowTaskSupplierPurchaseBatchBridge(deps);

    await expect(bridge.completeLegacyReview({
      authContext: auth(), batch: batch({ approval_round: 4 }),
      action: "approve", reason: null, output: {},
      idempotencyKey: "legacy-review-stale",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE",
    });

    deps.lookupRepository.listRunningInstances.mockImplementation(
      async () => [instance({ context: { approval_round: 4 } })],
    );
    deps.lookupRepository.listPendingTasks.mockImplementation(
      async () => [pendingTask({ assignee_employee_id: USER_ID })],
    );
    await expect(bridge.completeLegacyReview({
      authContext: auth(), batch: batch({ approval_round: 4 }),
      action: "approve", reason: null, output: {},
      idempotencyKey: "legacy-review-assignee",
    })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(deps.repository.completeTask).not.toHaveBeenCalled();
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
    status: "pending_approval", version: 2, approval_round: 3,
    submitted_by_employee_id: "b1000000-0000-4000-8000-000000000099",
    ...overrides,
  };
}

function instance(overrides: Record<string, unknown> = {}) {
  return {
    id: INSTANCE_ID,
    tenant_id: TENANT_ID,
    subject_type: "supplier_purchase_batch" as const,
    subject_id: BATCH_ID,
    status: "running",
    current_node_key: "purchase_review",
    context: { approval_round: 3 },
    ...overrides,
  };
}

function pendingTask(overrides: Record<string, unknown> = {}) {
  return {
    ...task(),
    instance_id: INSTANCE_ID,
    status: "pending" as const,
    assignee_employee_id: EMPLOYEE_ID,
    assignee_role_code: null,
    assignee_permission_code: null,
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
