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
} as AuthContext;
const getRequiredAuthContext = mock(async () => authContext);
const bindTenantByInviteCode = mock(async () => ({ id: "binding-1" }));

mock.module("@/services/authorization", () => ({
  authorizationService: { getRequiredAuthContext },
}));
mock.module("@/services/platform-partners", () => ({
  platformPartnersService: { bindTenantByInviteCode },
}));

beforeEach(() => {
  getRequiredAuthContext.mockClear();
  bindTenantByInviteCode.mockClear();
});

describe("PlatformPartnersController tenant binding access", () => {
  test("passes the POST route write category to tenant authorization", async () => {
    const { default: controller } = await import(".");
    const request = {
      user: { sub: "auth-tenant" },
      method: "POST",
      routeOptions: { config: { tenantServiceAccess: "write" } },
      body: { invite_code: "partner-code" },
    } as FastifyRequest;

    await controller.bindTenantByInviteCode(request, {} as never);

    expect(getRequiredAuthContext).toHaveBeenCalledWith("auth-tenant", {
      tenantServiceAccess: "write",
    });
    expect(request.authContext).toBe(authContext);
  });
});
