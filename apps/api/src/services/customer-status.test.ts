import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const updateCustomerById = mock(async () => ({
  id: "customer-1",
  tenant_id: "tenant-1",
  owner_id: "owner-1",
  status: "following",
}));
const getPrimarySummary = mock(async () => ({
  id: "property-1",
  community: "秀园丽水明珠",
  building_info: "1-101",
}));
const findActiveByCustomerProperty = mock(async () => null);
const createProject = mock(async () => ({
  id: "project-1",
  tenant_id: "tenant-1",
  customer_id: "customer-1",
  property_id: "property-1",
  status: "designing",
}));
const syncProjectCreated = mock(async () => ({
  status: "started",
  workflow_key: "construction_main",
  definition_id: "project-definition-1",
  instance_id: "project-instance-1",
  current_node_key: "designing",
}));
const canAccessCustomer = mock(async () => true);
const assertPermission = mock(() => "self");
const assertTenantContext = mock(() => "tenant-1");
const syncFromRuntimeInstance = mock(async () => null);
const assignPendingTask = mock(async () => undefined);
const getRuntimeInstanceById = mock(async () => ({
  status: "completed",
  current_node_key: "potential",
  current_node_id: "node-1",
}));
const findDefinitionByKey = mock(async () => ({
  id: "definition-1",
  tenant_id: "tenant-1",
  workflow_key: "customer_main",
  name: "客户主流程",
  description: null,
  category: "sales",
  status: "active",
  active_version_id: "version-1",
  created_by: null,
  updated_by: null,
  created_at: "2026-06-17T00:00:00.000Z",
  updated_at: "2026-06-17T00:00:00.000Z",
}));
const listRuntimeInstances = mock(async () => ({
  list: [{
    id: "instance-1",
    current_node_key: "potential",
  }],
  pagination: {
    page: 1,
    pageSize: 1,
    total: 1,
    totalPages: 1,
  },
}));
const completeRuntimeNode = mock(async () => ({
  ok: true,
  instance: {
    id: "instance-1",
    current_node_key: "following",
  },
  completedNode: {},
  nextNode: {
    node_key: "following",
  },
  task: null,
}));

mock.module("@/repositories/customer-core", () => ({
  customerCoreRepository: {
    findById: mock(async () => null),
    updateById: updateCustomerById,
  },
}));

mock.module("@/repositories/customer-properties", () => ({
  customerPropertyRepository: {
    getPrimarySummary,
  },
}));

mock.module("@/repositories/projects", () => ({
  projectRepository: {
    findActiveByCustomerProperty,
    create: createProject,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext,
    assertPermission,
    canAccessCustomer,
    getScope: mock((
      authContext: { permissions?: Array<{ code: string; scope: string }> },
      permissionCode: string,
    ) =>
      authContext.permissions?.find((permission) =>
        permission.code === permissionCode
      )?.scope ?? null
    ),
  },
}));

mock.module("@/services/project-workflow-runtime", () => ({
  projectWorkflowRuntimeService: {
    syncProjectCreated,
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

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getRuntimeInstanceById,
    findDefinitionByKey,
    listRuntimeInstances,
    completeRuntimeNode,
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
  beforeEach(() => {
    updateCustomerById.mockClear();
    getPrimarySummary.mockClear();
    findActiveByCustomerProperty.mockClear();
    createProject.mockClear();
    syncProjectCreated.mockClear();
    canAccessCustomer.mockClear();
    assertPermission.mockClear();
    assertTenantContext.mockClear();
    syncFromRuntimeInstance.mockClear();
    assignPendingTask.mockClear();
    getRuntimeInstanceById.mockClear();
    findDefinitionByKey.mockClear();
    listRuntimeInstances.mockClear();
    listRuntimeInstances.mockImplementation(async () => ({
      list: [{
        id: "instance-1",
        current_node_key: "potential",
      }],
      pagination: {
        page: 1,
        pageSize: 1,
        total: 1,
        totalPages: 1,
      },
    }));
    completeRuntimeNode.mockClear();
    completeRuntimeNode.mockImplementation(async () => ({
      ok: true,
      instance: {
        id: "instance-1",
        current_node_key: "following",
      },
      completedNode: {},
      nextNode: {
        node_key: "following",
      },
      task: null,
    }));
  });

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

  test("starts project workflow when start design auto-creates a project", async () => {
    updateCustomerById.mockImplementationOnce(async () => ({
      id: "customer-1",
      tenant_id: "tenant-1",
      owner_id: "owner-1",
      status: "designing",
    }));
    listRuntimeInstances.mockImplementationOnce(async () => ({
      list: [{
        id: "customer-instance-1",
        current_node_key: "arrived",
      }],
      pagination: {
        page: 1,
        pageSize: 1,
        total: 1,
        totalPages: 1,
      },
    }));
    completeRuntimeNode.mockImplementationOnce(async () => ({
      ok: true,
      instance: {
        id: "customer-instance-1",
        current_node_key: "designing",
      },
      completedNode: {},
      nextNode: {
        node_key: "designing",
      },
      task: null,
    }));
    const { customerStatusService } = await import("./customer-status");

    await customerStatusService.transitionCustomerStatus({
      authContext: buildAuthContext(),
      customerId: "customer-1",
      existing: {
        id: "customer-1",
        tenant_id: "tenant-1",
        owner_id: "owner-1",
        name: "苏有朋",
        phone: "13200001003",
        status: "arrived",
      },
      payload: {
        action: "start_design",
        metadata: {},
      },
    });

    expect(createProject).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      customer_id: "customer-1",
      property_id: "property-1",
      status: "designing",
    }));
    expect(syncProjectCreated).toHaveBeenCalledWith({
      authContext: expect.objectContaining({
        tenantId: "tenant-1",
        employeeId: "employee-1",
      }),
      tenantId: "tenant-1",
      projectId: "project-1",
      source: "customer_start_design",
      extraContext: {
        customer_id: "customer-1",
      },
    });
  });
});
