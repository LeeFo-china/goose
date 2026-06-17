import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

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
  list: [],
  pagination: {
    page: 1,
    pageSize: 1,
    total: 0,
    totalPages: 0,
  },
}));
const startRuntimeInstance = mock(async () => ({
  ok: true,
  instance: {
    id: "instance-1",
    current_node_key: "potential",
  },
  currentNode: {},
  task: null,
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    findDefinitionByKey,
    listRuntimeInstances,
    startRuntimeInstance,
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

describe("customerWorkflowRuntimeService", () => {
  test("starts customer runtime without changing status for newly created potential customer", async () => {
    const { customerWorkflowRuntimeService } = await import(
      "./customer-workflow-runtime"
    );

    const result = await customerWorkflowRuntimeService.syncCustomerCreated({
      authContext: buildAuthContext(),
      tenantId: "tenant-1",
      customerId: "customer-1",
    });

    expect(startRuntimeInstance).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      subjectType: "customer",
      subjectId: "customer-1",
      startedBy: "employee-1",
      context: expect.objectContaining({
        source: "customer_create",
        customer_id: "customer-1",
        operator_employee_id: "employee-1",
        operator_auth_user_id: "auth-1",
      }),
    }));
    expect(result).toMatchObject({
      status: "started",
      workflow_key: "customer_main",
      definition_id: "definition-1",
      instance_id: "instance-1",
      current_node_key: "potential",
    });
  });
});
