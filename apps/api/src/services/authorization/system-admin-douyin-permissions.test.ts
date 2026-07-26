import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_PUBLISH ||= "test-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

mock.module("@/repositories/permissions", () => ({
  permissionRepository: {},
}));

const TENANT_DOUYIN_PERMISSIONS = [
  "douyin_miniapp.read",
  "douyin_miniapp.manage",
  "douyin_miniapp.audit.submit",
  "douyin_lead.read",
  "douyin_lead.assign",
  "douyin_lead.follow_up",
  "douyin_lead.convert",
] as const;

describe("system administrator Douyin permissions", () => {
  test("includes every tenant Douyin permission in the derived auth context", async () => {
    const { buildAuthContext } = await import("./legacy/context-builder");
    const context = buildAuthContext(systemAdminPermissionContext(), "user-1");
    const permissions = new Map(
      context.permissions.map((permission) => [
        permission.code,
        permission.scope,
      ]),
    );

    for (const code of TENANT_DOUYIN_PERMISSIONS) {
      expect(permissions.get(code)).toBe("all");
    }
  });
});

function systemAdminPermissionContext() {
  return {
    employee: {
      id: "employee-1",
      user_id: "user-1",
      tenant_id: "tenant-1",
      status: "active",
      tenant_department_id: null,
      post_id: null,
      name: "租户管理员",
      phone: null,
      avatar: null,
      tenant_department: null,
      post: null,
      tenant: {
        id: "tenant-1",
        name: "测试租户",
        slug: "test-tenant",
        status: "active",
      },
    },
    roles: [
      {
        id: "role-1",
        tenant_id: "tenant-1",
        code: "system_admin",
        name: "系统管理员",
        description: null,
        status: "active",
        created_at: "2026-07-26T00:00:00.000Z",
        updated_at: "2026-07-26T00:00:00.000Z",
      },
    ],
    rolePermissions: [],
    overrides: [],
  };
}
