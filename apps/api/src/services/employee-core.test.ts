import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const count = mock(async () => 0);
const listRows = mock(async () => []);
const listEmployeeRoleMap = mock(async () => new Map());
const listEmployeeIdsByRoleId = mock(async () => ["employee-a", "employee-b"]);
const create = mock(async (payload: Record<string, unknown>) => ({
  id: "employee-created",
  ...payload,
}));

mock.module("@/repositories/employee-core", () => ({
  employeeCoreRepository: {
    count,
    listRows,
    listEmployeeRoleMap,
    listEmployeeIdsByRoleId,
    create,
  },
}));

const assertTenantContext = mock(() => "tenant-1");
const assertPermission = mock(() => "all");

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext,
    assertPermission,
  },
}));

const assertEmployeeDepartmentPostAllowed = mock(async () => {});

mock.module("@/services/department-post-rules", () => ({
  departmentPostRuleService: {
    assertEmployeeDepartmentPostAllowed,
  },
}));

const listRolesByIds = mock(async (roleIds: string[]) =>
  roleIds.map((id) => ({
    id,
    code: `role_${id.slice(0, 8)}`,
    name: "角色",
    description: null,
    status: "active",
  }))
);
const replaceEmployeeRoles = mock(async () => []);

mock.module("@/repositories/permissions", () => ({
  permissionRepository: {
    listRolesByIds,
    replaceEmployeeRoles,
  },
}));

function buildAuthContext(): AuthContext {
  return {
    authUserId: "auth-user",
    employeeId: "employee-current",
    tenantId: "tenant-1",
    tenantName: null,
    tenantSlug: null,
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: null,
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: "department-current",
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: [{ code: "employee.read", scope: "all" }],
  };
}

describe("employeeCoreService", () => {
  beforeEach(() => {
    count.mockClear();
    listRows.mockClear();
    listEmployeeRoleMap.mockClear();
    listEmployeeIdsByRoleId.mockClear();
    create.mockClear();
    assertTenantContext.mockClear();
    assertPermission.mockClear();
    assertEmployeeDepartmentPostAllowed.mockClear();
    listRolesByIds.mockClear();
    replaceEmployeeRoles.mockClear();
  });

  test("passes department, post, and role filters into the paginated employee query", async () => {
    const { employeeCoreService } = await import("./employee-core");

    await employeeCoreService.listEmployees({
      authContext: buildAuthContext(),
      query: {
        page: 1,
        pageSize: 20,
        status: "active",
        keyword: " 张 ",
        tenant_department_id: "11111111-1111-4111-8111-111111111111",
        post_id: "22222222-2222-4222-8222-222222222222",
        role_id: "33333333-3333-4333-8333-333333333333",
      },
    });

    expect(listEmployeeIdsByRoleId).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      roleId: "33333333-3333-4333-8333-333333333333",
    });
    expect(count).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      status: "active",
      keyword: "张",
      tenantDepartmentId: "11111111-1111-4111-8111-111111111111",
      postId: "22222222-2222-4222-8222-222222222222",
      roleEmployeeIds: ["employee-a", "employee-b"],
    }));
  });

  test("assigns selected tenant roles when creating an employee", async () => {
    const { employeeCoreService } = await import("./employee-core");
    const roleIds = [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];

    await employeeCoreService.createEmployee({
      authContext: buildAuthContext(),
      payload: {
        name: "新员工",
        phone: "18800003002",
        status: "active",
        tenant_department_id: null,
        post_id: null,
        role_ids: roleIds,
      },
    });

    expect(assertPermission).toHaveBeenCalledWith(
      expect.any(Object),
      "employee.create",
    );
    expect(assertPermission).toHaveBeenCalledWith(
      expect.any(Object),
      "employee.permission_manage",
    );
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      name: "新员工",
      tenant_id: "tenant-1",
    }));
    expect(listRolesByIds).toHaveBeenCalledWith(roleIds, "tenant-1");
    expect(replaceEmployeeRoles).toHaveBeenCalledWith("employee-created", {
      role_ids: roleIds,
    });
  });
});
