import { describe, expect, mock, test } from "bun:test";
import { ErrorCodes } from "@/errors/error-codes";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_PUBLISH ||= "test-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

const baseAuthContext = {
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
  roleCodes: ["platform_staff", "platform_operations"],
  roles: [],
  permissions: [{ code: "platform.tenant.read", scope: "all" }],
} satisfies AuthContext;

const activeSnapshot = {
  employee_id: "employee-1",
  tenant_id: null,
  status: "active",
  admin_auth_version: 4,
  role_codes: ["platform_staff", "platform_operations"],
};

describe("PlatformAuthorizationService", () => {
  test("allows active platform staff when token version matches", async () => {
    const { PlatformAuthorizationService } = await import("./platform-authorization");
    const service = new PlatformAuthorizationService({
      repository: {
        getSecuritySnapshot: mock(async () => activeSnapshot),
      },
    });

    const context = await service.assertPlatformSession(baseAuthContext, 4);

    expect(context).toMatchObject({
      employeeId: "employee-1",
      tenantId: null,
      isPlatformStaff: true,
      isPlatformSuperAdmin: false,
      adminAuthVersion: 4,
    });
  });

  test("rejects missing or stale token versions", async () => {
    const { PlatformAuthorizationService } = await import("./platform-authorization");
    const service = new PlatformAuthorizationService({
      repository: {
        getSecuritySnapshot: mock(async () => activeSnapshot),
      },
    });

    await expect(
      service.assertPlatformSession(baseAuthContext, undefined),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ErrorCodes.ADMIN_SESSION_REVOKED,
    });
    await expect(
      service.assertPlatformSession(baseAuthContext, 3),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ErrorCodes.ADMIN_SESSION_REVOKED,
    });
  });

  test("rejects non-platform or inactive employees", async () => {
    const { PlatformAuthorizationService } = await import("./platform-authorization");
    const service = new PlatformAuthorizationService({
      repository: {
        getSecuritySnapshot: mock(async () => ({
          ...activeSnapshot,
          status: "suspended",
        })),
      },
    });

    await expect(
      service.assertPlatformSession(baseAuthContext, 4),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: ErrorCodes.PLATFORM_STAFF_REQUIRED,
    });

    service.repository.getSecuritySnapshot = mock(async () => ({
      ...activeSnapshot,
      tenant_id: "tenant-1",
    }));

    await expect(
      service.assertPlatformSession({
        ...baseAuthContext,
        tenantId: "tenant-1",
        isPlatformStaff: false,
      }, 4),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: ErrorCodes.PLATFORM_STAFF_REQUIRED,
    });
  });

  test("checks platform permissions and super admin role", async () => {
    const { PlatformAuthorizationService } = await import("./platform-authorization");
    const service = new PlatformAuthorizationService({
      repository: {
        getSecuritySnapshot: mock(async () => activeSnapshot),
      },
    });
    const context = await service.assertPlatformSession(baseAuthContext, 4);

    expect(() =>
      service.assertPermission(context, "platform.tenant.read"),
    ).not.toThrow();
    expectBusinessErrorCode(() =>
      service.assertPermission(context, "platform.operator.manage"),
      ErrorCodes.PLATFORM_PERMISSION_REQUIRED,
    );
    expectBusinessErrorCode(
      () => service.assertSuperAdmin(context),
      ErrorCodes.PLATFORM_SUPER_ADMIN_REQUIRED,
    );
    expect(() =>
      service.assertSuperAdmin({
        ...context,
        isPlatformSuperAdmin: true,
        isPlatformAdmin: true,
      }),
    ).not.toThrow();
  });
});

function expectBusinessErrorCode(action: () => void, code: string) {
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }

  throw new Error(`Expected action to throw ${code}`);
}
