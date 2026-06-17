import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const updateCustomerById = mock(async () => ({
  id: "customer-1",
  tenant_id: "tenant-1",
  owner_id: "owner-1",
  status: "following",
}));
const canAccessCustomer = mock(async () => true);
const assertTenantContext = mock(() => "tenant-1");
const syncStatusTransition = mock(async () => ({
  status: "advanced",
  workflow_key: "customer_main",
  definition_id: "definition-1",
  instance_id: "instance-1",
  node_key: "potential",
  current_node_key: "following",
  next_node_key: "following",
}));
const syncFromRuntimeInstance = mock(async () => null);
const assignPendingTask = mock(async () => undefined);

mock.module("@/repositories/customer-core", () => ({
  customerCoreRepository: {
    updateById: updateCustomerById,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext,
    canAccessCustomer,
  },
}));

mock.module("@/services/customer-workflow-runtime", () => ({
  customerWorkflowRuntimeService: {
    syncStatusTransition,
  },
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    syncFromRuntimeInstance,
  },
}));

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    assignPendingTask,
  },
}));

function buildAuthContext(): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId: "employee-1",
    tenantId: "tenant-1",
    tenantName: null,
    tenantSlug: null,
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "业务员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: "department-1",
    departmentCode: "MARKETING",
    departmentName: "市场部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: [],
  };
}

describe("customerStatusService", () => {
  test("assigns next pending customer workflow task to the customer owner after status transition", async () => {
    const { customerStatusService } = await import("./customer-status");

    await customerStatusService.transitionCustomerStatus({
      authContext: buildAuthContext(),
      customerId: "customer-1",
      existing: {
        id: "customer-1",
        tenant_id: "tenant-1",
        owner_id: "owner-1",
        status: "potential",
      },
      payload: {
        action: "start_following",
        metadata: {},
      },
    });

    expect(assignPendingTask).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      instanceId: "instance-1",
      nodeKey: "following",
      assigneeEmployeeId: "owner-1",
    });
    expect(syncFromRuntimeInstance).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      subjectType: "customer",
      subjectId: "customer-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
    });
  });
});
