import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type { FastifyRequest } from "fastify";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_PUBLISH ||= "test-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

const authContext = {
  authUserId: "auth-platform",
  employeeId: "employee-1",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: false,
  isPlatformStaff: true,
  isPlatformSuperAdmin: false,
  adminAuthVersion: 4,
  employeeName: "平台运营",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_staff"],
  roles: [],
  permissions: [{ code: "platform.tenant.read", scope: "all" }],
} satisfies AuthContext;

const getRequiredAuthContext = mock(async () => authContext);
const assertPlatformSession = mock(async () => authContext);
const assertPermission = mock(() => undefined);
const assertSuperAdmin = mock(() => undefined);

mock.module("@/services/authorization", () => ({
  authorizationService: {
    getRequiredAuthContext,
  },
}));

describe("PlatformBaseController", () => {
  test("uses fresh platform session validation for staff, permissions and super admin", async () => {
    const platformAuthorization = await import("@/services/platform-authorization");
    const originalPlatformAuthorizationService = {
      assertPlatformSession:
        platformAuthorization.platformAuthorizationService.assertPlatformSession,
      assertPermission:
        platformAuthorization.platformAuthorizationService.assertPermission,
      assertSuperAdmin:
        platformAuthorization.platformAuthorizationService.assertSuperAdmin,
    };
    platformAuthorization.platformAuthorizationService.assertPlatformSession =
      assertPlatformSession;
    platformAuthorization.platformAuthorizationService.assertPermission =
      assertPermission;
    platformAuthorization.platformAuthorizationService.assertSuperAdmin =
      assertSuperAdmin;

    const { PlatformBaseController } = await import("./PlatformBaseController");
    class TestController extends PlatformBaseController {
      staff(request: FastifyRequest) {
        return this.getRequiredPlatformStaffContext(request);
      }

      permission(request: FastifyRequest) {
        return this.getRequiredPlatformPermissionContext(
          request,
          "platform.tenant.read",
        );
      }

      superAdmin(request: FastifyRequest) {
        return this.getRequiredPlatformSuperAdminContext(request);
      }
    }
    const controller = new TestController("test");
    const request = {
      user: {
        sub: "auth-platform",
        admin_auth_version: 4,
      },
    } as FastifyRequest;

    await controller.staff(request);
    await controller.permission(request);
    await controller.superAdmin(request);

    expect(getRequiredAuthContext).toHaveBeenCalledWith("auth-platform");
    expect(assertPlatformSession).toHaveBeenCalledTimes(3);
    expect(assertPlatformSession).toHaveBeenCalledWith(authContext, 4);
    expect(assertPermission).toHaveBeenCalledWith(
      authContext,
      "platform.tenant.read",
    );
    expect(assertSuperAdmin).toHaveBeenCalledWith(authContext);

    platformAuthorization.platformAuthorizationService.assertPlatformSession =
      originalPlatformAuthorizationService.assertPlatformSession;
    platformAuthorization.platformAuthorizationService.assertPermission =
      originalPlatformAuthorizationService.assertPermission;
    platformAuthorization.platformAuthorizationService.assertSuperAdmin =
      originalPlatformAuthorizationService.assertSuperAdmin;
  });
});
