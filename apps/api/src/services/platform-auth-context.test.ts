import { describe, expect, mock, test } from "bun:test";
import { PERMISSION_CODE_VALUES } from "@gooes/domain";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_PUBLISH ||= "test-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

mock.module("@/repositories/permissions", () => ({
  permissionRepository: {},
}));

describe("platform auth context", () => {
  test("distinguishes platform staff from platform super admin", async () => {
    const { buildAuthContext } = await import("./authorization/legacy/context-builder");

    const staffContext = buildAuthContext(
      permissionContext({
        tenantId: null,
        adminAuthVersion: 3,
        roleCodes: ["platform_staff", "platform_operations"],
      }),
      "auth-platform-staff",
    );
    const superContext = buildAuthContext(
      permissionContext({
        tenantId: null,
        adminAuthVersion: 7,
        roleCodes: ["platform_admin"],
      }),
      "auth-platform-admin",
    );

    expect(staffContext).toMatchObject({
      tenantId: null,
      isPlatformStaff: true,
      isPlatformSuperAdmin: false,
      isPlatformAdmin: false,
      adminAuthVersion: 3,
    });
    expect(superContext).toMatchObject({
      tenantId: null,
      isPlatformStaff: true,
      isPlatformSuperAdmin: true,
      isPlatformAdmin: true,
      adminAuthVersion: 7,
    });
  });

  test("keeps system_admin full permissions tenant scoped only", async () => {
    const { buildAuthContext } = await import("./authorization/legacy/context-builder");

    const tenantSystemAdmin = buildAuthContext(
      permissionContext({
        tenantId: "tenant-1",
        adminAuthVersion: 1,
        roleCodes: ["system_admin"],
      }),
      "auth-tenant-system-admin",
    );
    const platformSystemAdmin = buildAuthContext(
      permissionContext({
        tenantId: null,
        adminAuthVersion: 1,
        roleCodes: ["system_admin"],
      }),
      "auth-platform-system-admin",
    );

    expect(tenantSystemAdmin.permissions.length).toBe(
      PERMISSION_CODE_VALUES.length,
    );
    expect(platformSystemAdmin.permissions).not.toEqual(
      PERMISSION_CODE_VALUES.map((code) => ({ code, scope: "all" })),
    );
  });

  test("signs platform admin tokens with session version and shorter ttl", async () => {
    process.env.JWT_SECRET = "platform-admin-token-test-secret";
    process.env.PLATFORM_ADMIN_JWT_EXPIRES_IN = "12h";

    const { signAdminToken, verifyTokenDetailed } = await import("@/utils/jwt");

    const token = signAdminToken(
      {
        sub: "auth-platform",
        login_channel: "admin_web",
        roles: ["employee"],
        admin_auth_version: 5,
      },
      { platform: true },
    );
    const { payload, reason } = verifyTokenDetailed(token);

    expect(reason).toBe("valid");
    expect(payload).toMatchObject({
      sub: "auth-platform",
      login_channel: "admin_web",
      roles: ["employee"],
      admin_auth_version: 5,
    });
    expect((payload?.exp ?? 0) - (payload?.iat ?? 0)).toBe(12 * 60 * 60);
  });
});

function permissionContext(input: {
  tenantId: string | null;
  adminAuthVersion: number;
  roleCodes: string[];
}) {
  return {
    employee: {
      id: "employee-1",
      user_id: "auth-user-1",
      tenant_id: input.tenantId,
      status: "active",
      admin_auth_version: input.adminAuthVersion,
      tenant_department_id: null,
      post_id: null,
      name: "测试员工",
      phone: null,
      avatar: null,
      tenant_department: null,
      post: null,
      tenant: input.tenantId
        ? {
          id: input.tenantId,
          name: "测试租户",
          slug: "test-tenant",
          status: "active",
        }
        : null,
    },
    roles: input.roleCodes.map((code, index) => ({
      id: `role-${index}`,
      tenant_id: code === "system_admin" && input.tenantId
        ? input.tenantId
        : null,
      code,
      name: code,
      description: null,
      status: "active",
      created_at: "2026-08-05T00:00:00.000Z",
      updated_at: "2026-08-05T00:00:00.000Z",
    })),
    rolePermissions: [],
    overrides: [],
  };
}
