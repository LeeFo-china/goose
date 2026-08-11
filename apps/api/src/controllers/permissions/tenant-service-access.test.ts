import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type { FastifyRequest } from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const authContext = {
  authUserId: "auth-tenant",
  employeeId: "employee-tenant",
  tenantId: "tenant-1",
  isPlatformAdmin: false,
  permissions: [{ code: "employee.permission_manage", scope: "all" }],
} as AuthContext;
const getRequiredAuthContext = mock(async () => authContext);
const listPermissions = mock(async () => []);

mock.module("@/services/authorization", () => ({
  authorizationService: { getRequiredAuthContext },
}));
mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock(() => "tenant-1"),
    assertPermission: mock(() => "all"),
  },
}));
mock.module("@/services/permissions", () => ({
  permissionService: { listPermissions },
}));

beforeEach(() => {
  getRequiredAuthContext.mockClear();
  listPermissions.mockClear();
});

describe("PermissionsController tenant service access", () => {
  test("passes the GET route read category to tenant authorization", async () => {
    const { default: controller } = await import(".");
    const request = {
      user: { sub: "auth-tenant" },
      method: "GET",
      routeOptions: { config: { tenantServiceAccess: "read" } },
      query: {},
    } as FastifyRequest;

    await controller.list(request, {} as never);

    expect(getRequiredAuthContext).toHaveBeenCalledWith("auth-tenant", {
      tenantServiceAccess: "read",
    });
    expect(request.authContext).toBe(authContext);
  });
});
