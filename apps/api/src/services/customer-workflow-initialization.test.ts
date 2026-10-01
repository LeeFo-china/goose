import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type { CustomerWorkflowRuntimeMetadata } from "@/services/customer-workflow-runtime";

const syncCustomerCreated = mock(
  async (): Promise<CustomerWorkflowRuntimeMetadata> => ({
    status: "started",
    workflow_key: "customer_main",
    definition_id: "definition-1",
    instance_id: "instance-1",
    current_node_key: "potential",
  }),
);
const syncStatusTransition = mock(
  async (input: { toStatus: string }): Promise<CustomerWorkflowRuntimeMetadata> => ({
    status: "advanced",
    workflow_key: "customer_main",
    definition_id: "definition-1",
    instance_id: "instance-1",
    current_node_key: input.toStatus,
  }),
);
const syncWorkflowTasksAfterOwnerAssignment = mock(async () => undefined);
const syncFromRuntimeInstance = mock(async () => null);

mock.module("@/services/customer-workflow-runtime", () => ({
  customerWorkflowRuntimeService: {
    syncCustomerCreated,
    syncStatusTransition,
  },
}));

mock.module("@/services/customer-owner-assignments", () => ({
  customerOwnerAssignmentService: { syncWorkflowTasksAfterOwnerAssignment },
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: { syncFromRuntimeInstance },
}));

const authContext: AuthContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "测试员工",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [],
};

const input = {
  authContext,
  tenantId: "tenant-1",
  customerId: "customer-1",
  ownerId: "owner-1",
};

beforeEach(() => {
  syncCustomerCreated.mockClear();
  syncStatusTransition.mockClear();
  syncWorkflowTasksAfterOwnerAssignment.mockClear();
  syncFromRuntimeInstance.mockClear();
  syncCustomerCreated.mockImplementation(async () => ({
    status: "started",
    workflow_key: "customer_main",
    definition_id: "definition-1",
    instance_id: "instance-1",
    current_node_key: "potential",
  }));
});

describe("customerWorkflowInitializationService", () => {
  test("returns ready on first success and assigns the owner to the pending task", async () => {
    const { customerWorkflowInitializationService } = await import(
      "./customer-workflow-initialization"
    );

    await expect(customerWorkflowInitializationService.initialize(input)).resolves
      .toEqual({ status: "ready", attempts: 1 });
    expect(syncWorkflowTasksAfterOwnerAssignment).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      customerId: "customer-1",
      ownerId: "owner-1",
    });
    expect(syncFromRuntimeInstance).not.toHaveBeenCalled();
  });

  test("retries one failed initialization and then returns ready", async () => {
    syncCustomerCreated
      .mockImplementationOnce(async () => ({
        status: "failed",
        reason: "temporary_database_error",
        error_message: "secret database detail",
      }))
      .mockImplementationOnce(async () => ({
        status: "started",
        definition_id: "definition-1",
        instance_id: "instance-1",
        current_node_key: "potential",
      }));
    const { customerWorkflowInitializationService } = await import(
      "./customer-workflow-initialization"
    );

    await expect(customerWorkflowInitializationService.initialize(input)).resolves
      .toEqual({ status: "ready", attempts: 2 });
    expect(syncCustomerCreated).toHaveBeenCalledTimes(2);
  });

  test("does not retry when active customer workflow configuration is missing", async () => {
    syncCustomerCreated.mockImplementationOnce(async () => ({
      status: "skipped",
      reason: "active_customer_workflow_not_found",
    }));
    const { customerWorkflowInitializationService } = await import(
      "./customer-workflow-initialization"
    );

    await expect(customerWorkflowInitializationService.initialize(input)).resolves
      .toEqual({
        status: "degraded",
        attempts: 1,
        code: "CUSTOMER_WORKFLOW_CONFIGURATION_MISSING",
        reason: "active_customer_workflow_not_found",
      });
    expect(syncCustomerCreated).toHaveBeenCalledTimes(1);
  });

  test("returns a stable degraded result after two failed attempts", async () => {
    syncCustomerCreated.mockImplementation(async () => ({
      status: "failed",
      reason: "exception",
      error_message: "must not escape",
    }));
    const { customerWorkflowInitializationService } = await import(
      "./customer-workflow-initialization"
    );

    await expect(customerWorkflowInitializationService.initialize(input)).resolves
      .toEqual({
        status: "degraded",
        attempts: 2,
        code: "CUSTOMER_WORKFLOW_INITIALIZATION_FAILED",
        reason: "exception",
      });
    expect(syncCustomerCreated).toHaveBeenCalledTimes(2);
  });

  test("syncs the subject projection directly for an ownerless customer", async () => {
    const { customerWorkflowInitializationService } = await import(
      "./customer-workflow-initialization"
    );

    await expect(customerWorkflowInitializationService.initialize({
      ...input,
      ownerId: null,
    })).resolves.toEqual({ status: "ready", attempts: 1 });
    expect(syncWorkflowTasksAfterOwnerAssignment).not.toHaveBeenCalled();
    expect(syncFromRuntimeInstance).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      subjectType: "customer",
      subjectId: "customer-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
    });
  });

  test("recovers an existing running instance without retrying", async () => {
    syncCustomerCreated.mockImplementationOnce(async () => ({
      status: "skipped",
      reason: "running_instance_exists",
      definition_id: "definition-1",
      instance_id: "instance-1",
      current_node_key: "potential",
    }));
    const { customerWorkflowInitializationService } = await import(
      "./customer-workflow-initialization"
    );

    await expect(customerWorkflowInitializationService.initialize(input)).resolves
      .toEqual({ status: "ready", attempts: 1 });
    expect(syncCustomerCreated).toHaveBeenCalledTimes(1);
    expect(syncWorkflowTasksAfterOwnerAssignment).toHaveBeenCalledTimes(1);
  });
});
