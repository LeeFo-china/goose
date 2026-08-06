import { describe, expect, test } from "bun:test";

import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const ROLE_ID = "33333333-3333-4333-8333-333333333333";
const OPERATOR_ID = "44444444-4444-4444-8444-444444444444";
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

function operatorRecord() {
  return {
    id: OPERATOR_ID,
    name: "张运营",
    phone: "13800138000",
    status: "active",
    last_login_time: null,
    created_at: "2026-08-05T08:00:00.000Z",
    updated_at: "2026-08-05T08:00:00.000Z",
    version: 3,
    admin_auth_version: 2,
    roles: [
      {
        id: ROLE_ID,
        code: "platform_staff",
        name: "平台人员",
        status: "active",
      },
    ],
  };
}

describe("PlatformOperatorsService", () => {
  test("lists platform operators with pagination and masks phone numbers", async () => {
    const { PlatformOperatorsService } = await import(
      "@/services/platform-operators"
    );
    const repository = {
      list: async (query: unknown) => ({
        list: [operatorRecord()],
        pagination: {
          page: 2,
          pageSize: 10,
          total: 1,
          totalPages: 1,
        },
        query,
      }),
      findById: async () => null,
      createCommand: async () => null,
      updateCommand: async () => null,
      replaceRolesCommand: async () => null,
      transitionStatusCommand: async () => null,
      revokeSessionsCommand: async () => null,
    };
    const service = new PlatformOperatorsService({ repository });

    const result = await service.list(
      authContext({ permissions: ["platform.operator.read"] }),
      { page: 2, pageSize: 10, keyword: "张", status: "active" },
    );

    expect(repository.list).toHaveProperty("length", 1);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    expect(result.list[0]?.phone).toBe("138****8000");
    expect(result.list[0]?.phone_masked).toBe("138****8000");
    expect(result.list[0]).not.toHaveProperty("full_phone");
  });

  test("allows platform super admin to list operators when permission list is stale", async () => {
    const { PlatformOperatorsService } = await import(
      "@/services/platform-operators"
    );
    const repository = {
      list: async () => ({
        list: [operatorRecord()],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      }),
      findById: async () => null,
      createCommand: async () => null,
      updateCommand: async () => null,
      replaceRolesCommand: async () => null,
      transitionStatusCommand: async () => null,
      revokeSessionsCommand: async () => null,
    };
    const service = new PlatformOperatorsService({ repository });

    const result = await service.list(
      authContext({ isPlatformSuperAdmin: true }),
      { page: 1, pageSize: 20 },
    );

    expect(result.list).toHaveLength(1);
  });

  test("returns full phone only to managers on detail", async () => {
    const { PlatformOperatorsService } = await import(
      "@/services/platform-operators"
    );
    const repository = {
      list: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      findById: async () => operatorRecord(),
      createCommand: async () => null,
      updateCommand: async () => null,
      replaceRolesCommand: async () => null,
      transitionStatusCommand: async () => null,
      revokeSessionsCommand: async () => null,
    };
    const service = new PlatformOperatorsService({ repository });

    const readOnly = await service.getById(
      authContext({ permissions: ["platform.operator.read"] }),
      OPERATOR_ID,
    );
    const manager = await service.getById(
      authContext({
        permissions: ["platform.operator.read", "platform.operator.manage"],
      }),
      OPERATOR_ID,
    );

    expect(readOnly.phone).toBe("138****8000");
    expect(readOnly).not.toHaveProperty("full_phone");
    expect(manager.phone).toBe("13800138000");
    expect(manager.full_phone).toBe("13800138000");
  });

  test("requires platform super admin for create", async () => {
    const { PlatformOperatorsService } = await import(
      "@/services/platform-operators"
    );
    const repository = {
      list: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      findById: async () => null,
      createCommand: async () => operatorRecord(),
      updateCommand: async () => null,
      replaceRolesCommand: async () => null,
      transitionStatusCommand: async () => null,
      revokeSessionsCommand: async () => null,
    };
    const service = new PlatformOperatorsService({ repository });

    await expect(
      service.create(
        authContext({ permissions: ["platform.operator.manage"] }),
        {
          name: "新人员",
          phone: "13900139000",
          role_ids: [ROLE_ID],
          status: "pending",
          idempotency_key: IDEMPOTENCY_KEY,
        },
      ),
    ).rejects.toMatchObject({
      code: ErrorCodes.PLATFORM_SUPER_ADMIN_REQUIRED,
      statusCode: 403,
    });
  });

  test("allows platform super admin to create when permission list is stale", async () => {
    const { PlatformOperatorsService } = await import(
      "@/services/platform-operators"
    );
    const repository = {
      list: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      findById: async () => null,
      createCommand: async () => operatorRecord(),
      updateCommand: async () => null,
      replaceRolesCommand: async () => null,
      transitionStatusCommand: async () => null,
      revokeSessionsCommand: async () => null,
    };
    const service = new PlatformOperatorsService({ repository });

    await expect(
      service.create(
        authContext({ isPlatformSuperAdmin: true }),
        {
          name: "新人员",
          phone: "13900139000",
          role_ids: [ROLE_ID],
          status: "pending",
          idempotency_key: IDEMPOTENCY_KEY,
        },
      ),
    ).resolves.toEqual(operatorRecord());
  });

  test("maps RPC phone conflict into stable business error", async () => {
    const { PlatformOperatorsService } = await import(
      "@/services/platform-operators"
    );
    const repository = {
      list: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      findById: async () => null,
      createCommand: async () => {
        throw Errors.dbError("创建平台运营人员失败", {
          message: "PLATFORM_OPERATOR_PHONE_CONFLICT",
        });
      },
      updateCommand: async () => null,
      replaceRolesCommand: async () => null,
      transitionStatusCommand: async () => null,
      revokeSessionsCommand: async () => null,
    };
    const service = new PlatformOperatorsService({ repository });

    await expect(
      service.create(
        authContext({
          permissions: ["platform.operator.manage"],
          isPlatformSuperAdmin: true,
        }),
        {
          name: "新人员",
          phone: "13900139000",
          role_ids: [ROLE_ID],
          status: "pending",
          idempotency_key: IDEMPOTENCY_KEY,
        },
      ),
    ).rejects.toMatchObject({
      code: ErrorCodes.PLATFORM_OPERATOR_PHONE_CONFLICT,
      statusCode: 409,
    });
  });

  test("maps last super admin protection into stable business error", async () => {
    const { PlatformOperatorsService } = await import(
      "@/services/platform-operators"
    );
    const repository = {
      list: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
      findById: async () => null,
      createCommand: async () => null,
      updateCommand: async () => null,
      replaceRolesCommand: async () => null,
      transitionStatusCommand: async () => {
        throw Errors.dbError("变更平台运营人员状态失败", {
          message: "PLATFORM_LAST_SUPER_ADMIN_REQUIRED",
        });
      },
      revokeSessionsCommand: async () => null,
    };
    const service = new PlatformOperatorsService({ repository });

    await expect(
      service.transitionStatus(
        authContext({
          permissions: ["platform.operator.manage"],
          isPlatformSuperAdmin: true,
        }),
        OPERATOR_ID,
        "suspended",
        {
          expected_version: 3,
          idempotency_key: IDEMPOTENCY_KEY,
        },
      ),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      service.transitionStatus(
        authContext({
          permissions: ["platform.operator.manage"],
          isPlatformSuperAdmin: true,
        }),
        OPERATOR_ID,
        "suspended",
        {
          expected_version: 3,
          idempotency_key: IDEMPOTENCY_KEY,
        },
      ),
    ).rejects.toMatchObject({
      code: ErrorCodes.PLATFORM_LAST_SUPER_ADMIN_REQUIRED,
      statusCode: 409,
    });
  });
});
