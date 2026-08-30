import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "b1000000-0000-4000-8000-000000000001";
const BATCH_ID = "b1000000-0000-4000-8000-000000000002";
const PROJECT_ID = "b1000000-0000-4000-8000-000000000003";
const TASK_ID = "b1000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "b1000000-0000-4000-8000-000000000005";
const USER_ID = "b1000000-0000-4000-8000-000000000006";
const INSTANCE_ID = "b1000000-0000-4000-8000-000000000007";
const MISSING_PROJECT_ID = Symbol("missing-project-id");

async function subject(
  request: Record<string, unknown>,
  frozenProjectId: unknown = PROJECT_ID,
) {
  const { WorkflowTaskSupplierPurchaseBatchBridge } = await import(
    "./workflow-task-supplier-purchase-batch-bridge"
  );
  const completeTask = mock(async () => ({ status: "ordered" }));
  const findBatchAccessContext = mock(async () => ({
    tenant_id: TENANT_ID, project_id: PROJECT_ID,
    submitted_by_employee_id: USER_ID,
  }));
  const canAccessProject = mock(async (
    _context: AuthContext,
    _projectId: string,
    _permission: string,
  ) => true);
  const listPendingTasks = mock(async () => [task()]);
  const bridge = new WorkflowTaskSupplierPurchaseBatchBridge({
    repository: { completeTask },
    batchesRepository: { findBatchAccessContext },
    accessPolicy: {
      hasPermission: (context: AuthContext, code: string) =>
        context.permissions.some((permission) => permission.code === code),
      canAccessProject,
    },
    lookupRepository: {
      listReviewEvents: mock(async () => [{
        id: USER_ID, idempotency_key: "exact-key", request,
      }]),
      listRunningInstances: mock(async () => [instance("running", frozenProjectId)]),
      listPendingTasks,
      listTasksById: mock(async () => [task("completed")]),
      listInstancesById: mock(async () => [instance("completed", frozenProjectId)]),
    },
  });
  return { bridge, completeTask, findBatchAccessContext, canAccessProject,
    listPendingTasks };
}

describe("WorkflowTaskSupplierPurchaseBatchBridge exact replay", () => {
  test("adopts a pure legacy event through the current pending task", async () => {
    const current = await subject({
      tenant_id: TENANT_ID, batch_id: BATCH_ID, expected_version: 2,
      action: "approve",
    });

    await expect(current.bridge.completeLegacyReview({
      authContext: auth(), batch: { id: BATCH_ID, tenant_id: TENANT_ID,
        approval_round: 3 }, action: "approve", reason: null,
      expectedVersion: 2, output: {}, idempotencyKey: "exact-key",
    })).resolves.toMatchObject({ status: "ordered" });
    expect(current.listPendingTasks).toHaveBeenCalled();
    expect(current.completeTask).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK_ID, idempotencyKey: "exact-key" }),
    );
  });

  test("checks frozen project scope without current batch gates", async () => {
    const current = await subject({ workflow_task_request: {
      tenant_id: TENANT_ID, batch_id: BATCH_ID, task_id: TASK_ID,
      approval_round: 3,
    } });
    current.completeTask.mockImplementation(async () => ({
      status: "rejected", idempotent: true,
    }));
    current.findBatchAccessContext.mockImplementation(async () => ({
      tenant_id: TENANT_ID, project_id: PROJECT_ID,
      submitted_by_employee_id: EMPLOYEE_ID,
    }));
    current.canAccessProject.mockImplementation(async () => false);

    const replay = {
      authContext: auth(), tenantId: TENANT_ID, batchId: BATCH_ID,
      action: "reject", reason: "库存过高", expectedVersion: 2, output: {},
      idempotencyKey: "exact-key",
    };
    await expect(current.bridge.replayExactLegacyReview(replay))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(current.completeTask).not.toHaveBeenCalled();

    current.canAccessProject.mockClear();
    current.canAccessProject.mockImplementation(async () => true);
    await expect(current.bridge.replayExactLegacyReview(replay)).resolves.toEqual({
      matched: true,
      result: { status: "rejected", idempotent: true },
    });
    expect(current.findBatchAccessContext).not.toHaveBeenCalled();
    expect(current.canAccessProject.mock.calls).toEqual([
      [auth(), PROJECT_ID, "project.read"],
      [auth(), PROJECT_ID, "supplier.purchase-requisition.approve"],
    ]);
  });

  test.each([MISSING_PROJECT_ID, "not-a-uuid"])(
    "fails closed when the frozen project id is missing or invalid",
    async (projectId) => {
      const current = await subject({ workflow_task_request: {
        tenant_id: TENANT_ID, batch_id: BATCH_ID, task_id: TASK_ID,
        approval_round: 3,
      } }, projectId);

      await expect(current.bridge.replayExactLegacyReview({
        authContext: auth(), tenantId: TENANT_ID, batchId: BATCH_ID,
        action: "approve", reason: null, expectedVersion: 2, output: {},
        idempotencyKey: "exact-key",
      })).rejects.toMatchObject({
        statusCode: 409,
        code: "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      });
      expect(current.completeTask).not.toHaveBeenCalled();
    },
  );
});

function task(status: "pending" | "completed" = "pending") {
  return {
    id: TASK_ID, tenant_id: TENANT_ID, instance_id: INSTANCE_ID,
    node_key: "purchase_review", status,
    assignee_employee_id: EMPLOYEE_ID,
    assignee_role_code: null, assignee_permission_code: null,
  };
}

function instance(status: "running" | "completed", projectId: unknown) {
  return {
    id: INSTANCE_ID, tenant_id: TENANT_ID,
    subject_type: "supplier_purchase_batch" as const, subject_id: BATCH_ID,
    status, current_node_key: status === "running" ? "purchase_review" : null,
    context: projectId === MISSING_PROJECT_ID
      ? { approval_round: 3 }
      : { approval_round: 3, project_id: projectId },
  };
}

function auth(): AuthContext {
  return {
    authUserId: USER_ID, employeeId: EMPLOYEE_ID, tenantId: TENANT_ID,
    tenantName: "测试租户", tenantSlug: "test", tenantStatus: "active",
    isPlatformAdmin: false, employeeName: "审批人", employeeStatus: "active",
    departmentId: null, tenantDepartmentId: null, departmentCode: null,
    departmentName: null, postId: null, postName: null, avatar: null,
    roleCodes: [], roles: [], permissions: [
      "supplier.purchase-requisition.view", "project.read",
      "supplier.purchase-requisition.approve",
    ].map((code) => ({ code, scope: "all" })),
  };
}
