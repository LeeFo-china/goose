import { describe, expect, test } from "bun:test";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const ROLE_ID = "33333333-3333-4333-8333-333333333333";
const PERMISSION_ID = "44444444-4444-4444-8444-444444444444";
const IDEMPOTENCY_KEY = "55555555-5555-4555-8555-555555555555";

function authContext(input: {
  permissions?: string[];
  isPlatformSuperAdmin?: boolean;
} = {}): AuthContext {
  return {
    authUserId: AUTH_USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: input.isPlatformSuperAdmin ?? false,
    isPlatformStaff: true,
    isPlatformSuperAdmin: input.isPlatformSuperAdmin ?? false,
    adminAuthVersion: 1,
    employeeName: "平台运营",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: input.isPlatformSuperAdmin
      ? ["platform_admin", "platform_staff"]
      : ["platform_staff"],
    roles: [],
    permissions: (input.permissions ?? []).map((code) => ({
      code,
      scope: "all" as const,
    })),
  };
}

function roleRecord(input: Partial<{
  id: string;
  code: string;
  name: string;
  status: string;
  version: number;
}> = {}) {
  return {
    id: input.id ?? ROLE_ID,
    tenant_id: null,
    code: input.code ?? "platform_custom_ops",
    name: input.name ?? "运营角色",
    description: "负责运营",
    status: input.status ?? "active",
    version: input.version ?? 2,
    created_at: "2026-08-05T08:00:00.000Z",
    updated_at: "2026-08-05T08:00:00.000Z",
    permission_count: 1,
    employee_count: 2,
    permissions: [
      {
        id: PERMISSION_ID,
        code: "platform.tenant.read",
        name: "查看平台租户",
        module: "platform_access",
        resource: "tenant",
        action: "read",
        status: "active",
        access_scope: "all",
      },
    ],
  };
}

describe("PlatformRolesService", () => {
  test("lists only platform roles with pagination and protection markers", async () => {
    const { PlatformRolesService } = await import("@/services/platform-roles");
    const repository = {
      listRoles: async (query: unknown) => ({
        list: [
          roleRecord({ code: "platform_admin", name: "平台超管" }),
          roleRecord({ code: "platform_custom_ops", name: "运营角色" }),
        ],
        pagination: { page: 2, pageSize: 10, total: 2, totalPages: 1 },
        query,
      }),
      findRoleById: async () => null,
      listPermissions: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      createCommand: async () => null,
      updateCommand: async () => null,
      replacePermissionsCommand: async () => null,
      archiveCommand: async () => null,
    };
    const service = new PlatformRolesService({ repository });

    const result = await service.listRoles(
      authContext({ permissions: ["platform.role.read"] }),
      { page: 2, pageSize: 10, keyword: "运营" },
    );

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 2,
      totalPages: 1,
    });
    expect(result.list[0]?.is_protected).toBe(true);
    expect(result.list[1]?.is_protected).toBe(false);
  });

  test("lists active platform permissions only through repository contract", async () => {
    const { PlatformRolesService } = await import("@/services/platform-roles");
    const repository = {
      listRoles: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      findRoleById: async () => null,
      listPermissions: async (query: unknown) => ({
        list: [
          {
            id: PERMISSION_ID,
            code: "platform.role.read",
            name: "查看平台角色",
            module: "platform_access",
            resource: "role",
            action: "read",
            status: "active",
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        query,
      }),
      createCommand: async () => null,
      updateCommand: async () => null,
      replacePermissionsCommand: async () => null,
      archiveCommand: async () => null,
    };
    const service = new PlatformRolesService({ repository });

    const result = await service.listPermissions(
      authContext({ permissions: ["platform.role.read"] }),
      { page: 1, pageSize: 20 },
    );

    expect(result.list).toHaveLength(1);
    expect(result.list[0]?.code).toBe("platform.role.read");
  });

  test("rejects non-all permission scopes before hitting repository", async () => {
    const { PlatformRolesService } = await import("@/services/platform-roles");
    let called = false;
    const repository = {
      listRoles: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      findRoleById: async () => null,
      listPermissions: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      createCommand: async () => null,
      updateCommand: async () => null,
      replacePermissionsCommand: async () => {
        called = true;
        return null;
      },
      archiveCommand: async () => null,
    };
    const service = new PlatformRolesService({ repository });

    await expect(
      service.replacePermissions(
        authContext({
          permissions: ["platform.role.manage"],
          isPlatformSuperAdmin: true,
        }),
        ROLE_ID,
        {
          permissions: [
            {
              permission_id: PERMISSION_ID,
              access_scope: "self" as "all",
            },
          ],
          expected_version: 2,
          idempotency_key: IDEMPOTENCY_KEY,
        },
      ),
    ).rejects.toMatchObject({
      code: ErrorCodes.PLATFORM_ROLE_PERMISSION_INVALID,
      statusCode: 400,
    });
    expect(called).toBe(false);
  });

  test("maps protected role and in-use role RPC failures", async () => {
    const { PlatformRolesService } = await import("@/services/platform-roles");
    const repository = {
      listRoles: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      findRoleById: async () => null,
      listPermissions: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      createCommand: async () => null,
      updateCommand: async () => {
        throw Errors.dbError("更新平台角色失败", {
          message: "PLATFORM_ROLE_PROTECTED",
        });
      },
      replacePermissionsCommand: async () => null,
      archiveCommand: async () => {
        throw Errors.dbError("归档平台角色失败", {
          message: "PLATFORM_ROLE_IN_USE",
        });
      },
    };
    const service = new PlatformRolesService({ repository });
    const auth = authContext({
      permissions: ["platform.role.manage"],
      isPlatformSuperAdmin: true,
    });

    await expect(
      service.update(auth, ROLE_ID, {
        name: "新角色",
        expected_version: 2,
        idempotency_key: IDEMPOTENCY_KEY,
      }),
    ).rejects.toMatchObject({
      code: ErrorCodes.PLATFORM_ROLE_PROTECTED,
      statusCode: 409,
    });
    await expect(
      service.archive(auth, ROLE_ID, {
        expected_version: 2,
        idempotency_key: IDEMPOTENCY_KEY,
      }),
    ).rejects.toMatchObject({
      code: ErrorCodes.PLATFORM_ROLE_IN_USE,
      statusCode: 409,
    });
  });

  test("requires platform super admin for create", async () => {
    const { PlatformRolesService } = await import("@/services/platform-roles");
    const repository = {
      listRoles: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      findRoleById: async () => null,
      listPermissions: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      createCommand: async () => roleRecord(),
      updateCommand: async () => null,
      replacePermissionsCommand: async () => null,
      archiveCommand: async () => null,
    };
    const service = new PlatformRolesService({ repository });

    await expect(
      service.create(
        authContext({ permissions: ["platform.role.manage"] }),
        {
          name: "新角色",
          description: null,
          permission_ids: [],
          idempotency_key: IDEMPOTENCY_KEY,
        },
      ),
    ).rejects.toMatchObject({
      code: ErrorCodes.PLATFORM_SUPER_ADMIN_REQUIRED,
      statusCode: 403,
    });
  });
});
