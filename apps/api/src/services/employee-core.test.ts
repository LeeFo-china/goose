import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const count = mock(async () => 0);
const listRows = mock(async () => []);
const listEmployeeRoleMap = mock(async () => new Map());
const listEmployeeIdsByRoleId = mock(async () => ["employee-a", "employee-b"]);

mock.module("@/repositories/employee-core", () => ({
  employeeCoreRepository: {
    count,
    listRows,
    listEmployeeRoleMap,
    listEmployeeIdsByRoleId,
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

describe("employeeCoreService.listEmployees", () => {
  beforeEach(() => {
    count.mockClear();
    listRows.mockClear();
    listEmployeeRoleMap.mockClear();
    listEmployeeIdsByRoleId.mockClear();
    assertTenantContext.mockClear();
    assertPermission.mockClear();
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
});
