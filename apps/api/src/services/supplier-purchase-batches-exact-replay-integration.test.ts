import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "b3000000-0000-4000-8000-000000000001";
const BATCH_ID = "b3000000-0000-4000-8000-000000000002";
const FROZEN_PROJECT_ID = "b3000000-0000-4000-8000-000000000003";
const TASK_ID = "b3000000-0000-4000-8000-000000000004";
const INSTANCE_ID = "b3000000-0000-4000-8000-000000000005";
const USER_ID = "b3000000-0000-4000-8000-000000000006";
const EMPLOYEE_ID = "b3000000-0000-4000-8000-000000000007";

describe("SupplierPurchaseBatchesService exact workflow replay", () => {
  test("checks the frozen project through the service and real bridge", async () => {
    const { SupplierPurchaseBatchesService } = await import(
      "@/services/supplier-purchase-batches"
    );
    const { WorkflowTaskSupplierPurchaseBatchBridge } = await import(
      "@/services/workflow-task-supplier-purchase-batch-bridge"
    );
    const canAccessProject = mock(async (
      _context: AuthContext,
      _projectId: string,
      _permission: string,
    ) => true);
    const findBatch = mock(async () => null);
    const completeTask = mock(async () => ({
      status: "rejected", idempotent: true, version: 3,
      workflow_state: { instance_status: "completed" },
    }));
    const bridge = new WorkflowTaskSupplierPurchaseBatchBridge({
      repository: { completeTask },
      batchesRepository: { findBatchAccessContext: mock(async () => null) },
      accessPolicy: {
        hasPermission: (context: AuthContext, code: string) =>
          context.permissions.some((permission) => permission.code === code),
        canAccessProject,
      },
      lookupRepository: {
        listReviewEvents: mock(async () => [{
          id: USER_ID, idempotency_key: "old-round-key",
          request: { workflow_task_request: {
            tenant_id: TENANT_ID, batch_id: BATCH_ID, task_id: TASK_ID,
            approval_round: 3,
          } },
        }]),
        listTasksById: mock(async (_input: {
          tenantId: string; taskId: string;
        }) => [{
          id: TASK_ID, tenant_id: TENANT_ID, instance_id: INSTANCE_ID,
          node_key: "purchase_review", status: "completed" as const,
          assignee_employee_id: EMPLOYEE_ID, assignee_role_code: null,
          assignee_permission_code: null,
        }]),
        listInstancesById: mock(async (_input: {
          tenantId: string; instanceId: string;
        }) => [{
          id: INSTANCE_ID, tenant_id: TENANT_ID,
          subject_type: "supplier_purchase_batch" as const,
          subject_id: BATCH_ID, status: "completed" as const,
          current_node_key: null,
          context: { approval_round: 3, project_id: FROZEN_PROJECT_ID },
        }]),
        listRunningInstances: mock(async () => []),
        listPendingTasks: mock(async () => []),
      },
    });
    const scope = { tenantId: TENANT_ID, authUserId: USER_ID,
      employeeId: EMPLOYEE_ID };
    const service = new SupplierPurchaseBatchesService({
      access: {
        requireActorScope: mock(async () => scope),
        requireView: mock(async () => scope),
        requireApprove: mock(async () => scope),
        getVisibleProjectIds: mock(async () => null),
        assertProjectRead: mock(async () => undefined),
      },
      repository: { findBatch },
      workflowRuntime: { isEnabled: mock(async () => true) },
      workflowReviewBridge: bridge,
    } as never);

    await expect(service.review(auth(), BATCH_ID, {
      expected_version: 2, action: "reject", remark: "库存过高",
    }, "old-round-key")).resolves.toEqual({
      status: "rejected", idempotent: true, version: 3,
    });
    expect(findBatch).not.toHaveBeenCalled();
    expect(canAccessProject.mock.calls).toEqual([
      [auth(), FROZEN_PROJECT_ID, "project.read"],
      [auth(), FROZEN_PROJECT_ID, "supplier.purchase-requisition.approve"],
    ]);
    expect(completeTask).toHaveBeenCalled();
  });
});

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
