import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const ROLE_ID = "10000000-0000-4000-8000-000000000002";
const TENANT_PERMISSION_ID = "10000000-0000-4000-8000-000000000003";
const PLATFORM_PERMISSION_ID = "10000000-0000-4000-8000-000000000004";

const tenantPermission = permissionRecord({
  id: TENANT_PERMISSION_ID,
  code: "project.read",
  module: "project",
});
const platformPermission = permissionRecord({
  id: PLATFORM_PERMISSION_ID,
  code: "platform.operator.read",
  module: "platform_access",
});

const repository = {
  listPermissions: mock(async () => ({
    list: [tenantPermission],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  findRoleById: mock(async () => ({
    id: ROLE_ID,
    tenant_id: TENANT_ID,
    code: "tenant_admin",
    name: "租户管理员",
    description: null,
    status: "active",
    created_at: "2026-09-03T00:00:00.000Z",
    updated_at: "2026-09-03T00:00:00.000Z",
  })),
  listRolePermissionRecords: mock(async () => [
    { ...tenantPermission, access_scope: "all" },
    { ...platformPermission, access_scope: "all" },
  ]),
  findPermissionById: mock(async (id: string) =>
    id === PLATFORM_PERMISSION_ID ? platformPermission : tenantPermission
  ),
  replaceRolePermissions: mock(async () => []),
  listEmployeesByRoleId: mock(async () => []),
};

mock.module("@/repositories/permissions", () => ({
  permissionRepository: repository,
}));

mock.module("@/services/authorization", () => ({
  authorizationService: {
    invalidateAuthContext: mock(() => undefined),
    getAuthContextByEmployeeId: mock(async () => null),
  },
}));

beforeEach(() => {
  for (const value of Object.values(repository)) value.mockClear();
});

describe("tenant role permission platform boundary", () => {
  test("tenant permission catalog excludes platform permissions", async () => {
    const { permissionService } = await import("@/services/permissions");

    await permissionService.listPermissions({ page: 1, pageSize: 20 },
      tenantAuth());

    expect(repository.listPermissions).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      includePlatformPermissions: false,
    });
  });

  test("platform permission catalog keeps platform permissions", async () => {
    const { permissionService } = await import("@/services/permissions");

    await permissionService.listPermissions({ page: 1, pageSize: 20 },
      platformAuth());

    expect(repository.listPermissions).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      includePlatformPermissions: true,
    });
  });

  test("tenant role detail does not expose previously bound platform permissions", async () => {
    const { permissionService } = await import("@/services/permissions");

    const result = await permissionService.getRoleById(ROLE_ID, tenantAuth());

    expect(result.permissions.map((item) => item.code)).toEqual([
      "project.read",
    ]);
    expect(result.permission_count).toBe(1);
  });

  test("tenant role assignment rejects platform permission ids", async () => {
    const { permissionService } = await import("@/services/permissions");

    await expect(permissionService.replaceRolePermissions(
      tenantAuth(),
      ROLE_ID,
      {
        permissions: [{
          permission_id: PLATFORM_PERMISSION_ID,
          access_scope: "all",
        }],
      },
    )).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repository.replaceRolePermissions).not.toHaveBeenCalled();
  });
});

function tenantAuth(): AuthContext {
  return {
    authUserId: "auth-tenant",
    employeeId: "employee-tenant",
    tenantId: TENANT_ID,
    tenantName: "测试租户",
    tenantSlug: "tenant",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "租户管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["tenant_admin"],
    roles: [],
    permissions: [{ code: "employee.permission_manage", scope: "all" }],
  };
}

function platformAuth(): AuthContext {
  return {
    ...tenantAuth(),
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    isPlatformStaff: true,
    isPlatformSuperAdmin: true,
    roleCodes: ["platform_admin"],
    permissions: [{ code: "platform.role.read", scope: "all" }],
  };
}

function permissionRecord(input: {
  id: string;
  code: string;
  module: string;
}) {
  return {
    id: input.id,
    code: input.code,
    name: input.code,
    module: input.module,
    resource: input.module,
    action: "read",
    description: null,
    status: "active",
    created_at: "2026-09-03T00:00:00.000Z",
    updated_at: "2026-09-03T00:00:00.000Z",
  };
}
