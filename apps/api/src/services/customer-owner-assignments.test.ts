import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const events: string[] = [];
const findTargetEmployee = mock(async () => ({
  id: "sales-employee",
  name: "珠珠",
  tenant_department_id: "marketing-department",
  status: "active",
  tenant_id: "tenant-1",
}));
const listCustomers = mock(async () => [
  {
    id: "customer-1",
    owner_id: "system-admin-employee",
    tenant_id: "tenant-1",
  },
]);
const updateOwner = mock(async () => {
  events.push("update-owner");
});
type RunningWorkflowInstance = {
  id: string;
  definition_id: string;
  current_node_key: string | null;
};

const findLatestRunningRuntimeInstance = mock(async (): Promise<RunningWorkflowInstance | null> => ({
  id: "workflow-instance-1",
  definition_id: "workflow-definition-1",
  current_node_key: "following",
}));
const assignPendingTask = mock(async () => {
  events.push("assign-pending-task");
});
const syncFromRuntimeInstance = mock(async () => {
  events.push("sync-workflow-state");
  return null;
});
const assertTenantContext = mock(() => "tenant-1");
const hasPermission = mock(() => true);
const canAssignCustomerOwnerTarget = mock(() => true);
const canAssignCustomerOwner = mock(async () => true);
const getScope = mock((
  authContext: { permissions?: Array<{ code: string; scope: string }> },
  permissionCode: string,
) =>
  authContext.permissions?.find((permission) =>
    permission.code === permissionCode
  )?.scope ?? null
);

mock.module("@/repositories/customer-owner-assignments", () => ({
  customerOwnerAssignmentRepository: {
    findTargetEmployee,
    listCustomers,
    updateOwner,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    findLatestRunningRuntimeInstance,
  },
}));

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    assignPendingTask,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext,
    hasPermission,
    canAssignCustomerOwnerTarget,
    canAssignCustomerOwner,
    getScope,
  },
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    syncFromRuntimeInstance,
  },
}));

beforeEach(() => {
  events.length = 0;
  findTargetEmployee.mockClear();
  listCustomers.mockClear();
  updateOwner.mockClear();
  findLatestRunningRuntimeInstance.mockClear();
  assignPendingTask.mockClear();
  syncFromRuntimeInstance.mockClear();
  assertTenantContext.mockClear();
  hasPermission.mockClear();
  canAssignCustomerOwnerTarget.mockClear();
  canAssignCustomerOwner.mockClear();
  getScope.mockClear();
  findLatestRunningRuntimeInstance.mockImplementation(async (): Promise<RunningWorkflowInstance | null> => ({
    id: "workflow-instance-1",
    definition_id: "workflow-definition-1",
    current_node_key: "following",
  }));
});

function buildManagerAuthContext(): AuthContext {
  return {
    authUserId: "auth-manager",
    employeeId: "manager-employee",
    tenantId: "tenant-1",
    tenantName: null,
    tenantSlug: null,
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "萧峰",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: "marketing-department",
    departmentCode: "MARKETING",
    departmentName: "市场部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["marketing_manager"],
    roles: [],
    permissions: [{ code: "customer.assign_owner", scope: "all" }],
  };
}

describe("customerOwnerAssignmentService", () => {
  test("assigns current pending customer workflow task to the new owner after batch owner assignment", async () => {
    const { customerOwnerAssignmentService } = await import(
      "./customer-owner-assignments"
    );

    const result = await customerOwnerAssignmentService.batchAssignOwner({
      authContext: buildManagerAuthContext(),
      payload: {
        customer_ids: ["customer-1"],
        owner_id: "sales-employee",
        mode: "overwrite",
      },
    });

    expect(result.success_count).toBe(1);
    expect(updateOwner).toHaveBeenCalledWith({
      customerIds: ["customer-1"],
      ownerId: "sales-employee",
      tenantId: "tenant-1",
    });
    expect(findLatestRunningRuntimeInstance).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      subjectType: "customer",
      subjectId: "customer-1",
    });
    expect(assignPendingTask).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      instanceId: "workflow-instance-1",
      nodeKey: "following",
      assigneeEmployeeId: "sales-employee",
    });
    expect(syncFromRuntimeInstance).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      subjectType: "customer",
      subjectId: "customer-1",
      definitionId: "workflow-definition-1",
      instanceId: "workflow-instance-1",
    });
    expect(events).toEqual([
      "update-owner",
      "assign-pending-task",
      "sync-workflow-state",
    ]);
  });

  test("skips workflow task assignment when the customer has no running workflow instance", async () => {
    const { customerOwnerAssignmentService } = await import(
      "./customer-owner-assignments"
    );
    findLatestRunningRuntimeInstance.mockImplementationOnce(async () => null);

    await expect(
      customerOwnerAssignmentService.syncWorkflowTasksAfterOwnerAssignment({
        tenantId: "tenant-1",
        customerId: "customer-without-workflow",
        ownerId: "sales-employee",
      }),
    ).resolves.toBeUndefined();

    expect(assignPendingTask).not.toHaveBeenCalled();
    expect(syncFromRuntimeInstance).not.toHaveBeenCalled();
  });
});
