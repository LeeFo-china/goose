import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";
import type {
  TenantServiceAccessDecision,
  ResolveTenantServiceAccessInput,
} from "@/services/tenant-service-access";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantAuthContext = {
  authUserId: "user-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: "固始晴天装饰",
  tenantSlug: "qingtian",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "出纳员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [],
} satisfies AuthContext;

const platformAuthContext = {
  ...tenantAuthContext,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  roleCodes: ["platform_admin"],
} satisfies AuthContext;

const platformStaffAuthContext = {
  ...platformAuthContext,
  isPlatformAdmin: false,
  isPlatformStaff: true,
  isPlatformSuperAdmin: false,
  roleCodes: ["platform_staff"],
} satisfies AuthContext;

const tenantlessEmployeeAuthContext = {
  ...tenantAuthContext,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
} satisfies AuthContext;

const suspendedTenantAuthContext = {
  ...tenantAuthContext,
  tenantStatus: "suspended",
} satisfies AuthContext;

const paidDecision = decision({ mode: "paid", accessLevel: "read_write" });
const resolveForRoute = mock(
  async (_input: ResolveTenantServiceAccessInput):
    Promise<TenantServiceAccessDecision> => paidDecision,
);

async function createAuthorizationService(
  authContext: AuthContext = tenantAuthContext,
) {
  const { AuthorizationService } = await import("./legacy-service");
  const service = new AuthorizationService({
    tenantServiceAccessService: { resolveForRoute },
  });
  service.getAuthContextByAuthUserId = mock(async () => authContext);
  return service;
}

describe("AuthorizationService tenant service access guard", () => {
  beforeEach(() => {
    resolveForRoute.mockClear();
    resolveForRoute.mockImplementation(async () => paidDecision);
  });

  test.each([
    {
      mode: "service_blocked",
      accessLevel: "none",
      routeAccess: "recovery",
    },
    { mode: "grace", accessLevel: "read_only", routeAccess: "read" },
    { mode: "paid", accessLevel: "read_write", routeAccess: "write" },
  ] as const)("allows $mode access to $routeAccess routes", async (current) => {
    resolveForRoute.mockImplementationOnce(async () =>
      decision({
        mode: current.mode,
        accessLevel: current.accessLevel,
      }));
    const service = await createAuthorizationService();

    const authContext = await service.getRequiredAuthContext("user-1", {
      tenantServiceAccess: current.routeAccess,
    });

    expect(authContext).toBe(tenantAuthContext);
    expect(resolveForRoute).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      routeAccess: current.routeAccess,
      requiredCapability: null,
    });
  });

  test.each([
    {
      name: "hard blocked recovery",
      routeAccess: "recovery" as const,
      decision: decision({
        mode: "hard_blocked",
        accessLevel: "none",
        allowed: false,
        errorCode: "TENANT_SERVICE_HARD_BLOCKED",
        reason: "租户状态不可用",
      }),
    },
    {
      name: "grace write",
      routeAccess: "write" as const,
      decision: decision({
        mode: "grace",
        accessLevel: "read_only",
        allowed: false,
        errorCode: "TENANT_SERVICE_READ_ONLY",
        reason: "当前服务处于只读宽限期",
      }),
    },
  ])("rejects $name with stable decision details", async (current) => {
    resolveForRoute.mockImplementationOnce(async () => current.decision);
    const service = await createAuthorizationService();

    await expect(service.getRequiredAuthContext("user-1", {
      tenantServiceAccess: current.routeAccess,
    })).rejects.toMatchObject({
      statusCode: 403,
      code: current.decision.errorCode,
      message: current.decision.reason,
      details: {
        tenant_id: "tenant-1",
        access_mode: current.decision.mode,
        access_level: current.decision.accessLevel,
        starts_at: current.decision.startsAt,
        ends_at: current.decision.endsAt,
      },
    });
  });

  test.each(["read", "write"] as const)(
    "rejects service blocked %s access with payment-required status",
    async (routeAccess) => {
      const blockedDecision = decision({
        mode: "service_blocked",
        accessLevel: "none",
        allowed: false,
        errorCode: "TENANT_SERVICE_ACCESS_EXPIRED",
        reason: "租户服务访问已到期",
      });
      resolveForRoute.mockImplementationOnce(async () => blockedDecision);
      const service = await createAuthorizationService();

      await expect(service.getRequiredAuthContext("user-1", {
        tenantServiceAccess: routeAccess,
      })).rejects.toMatchObject({
        statusCode: 402,
        code: blockedDecision.errorCode,
        message: blockedDecision.reason,
      });
    },
  );

  test("does not resolve tenant service access for platform admins", async () => {
    const service = await createAuthorizationService(platformAuthContext);

    const authContext = await service.getRequiredAuthContext("platform-user", {
      tenantServiceAccess: "write",
    });

    expect(authContext.isPlatformAdmin).toBe(true);
    expect(resolveForRoute).not.toHaveBeenCalled();
  });

  test("does not resolve tenant service access for non-admin platform staff", async () => {
    const service = await createAuthorizationService(platformStaffAuthContext);

    const authContext = await service.getRequiredAuthContext("platform-staff", {
      tenantServiceAccess: "write",
    });

    expect(authContext.isPlatformStaff).toBe(true);
    expect(authContext.isPlatformAdmin).toBe(false);
    expect(resolveForRoute).not.toHaveBeenCalled();
  });

  test("lets the unified decision allow session for hard-blocked tenants", async () => {
    resolveForRoute.mockImplementationOnce(async () => decision({
      mode: "hard_blocked",
      accessLevel: "none",
    }));
    const service = await createAuthorizationService(
      suspendedTenantAuthContext,
    );

    const authContext = await service.getRequiredAuthContext("user-1", {
      tenantServiceAccess: "session",
    });

    expect(authContext).toBe(suspendedTenantAuthContext);
    expect(resolveForRoute).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      routeAccess: "session",
      requiredCapability: null,
    });
  });

  test("rejects tenantless employees before tenant service access resolution", async () => {
    const service = await createAuthorizationService(
      tenantlessEmployeeAuthContext,
    );

    await expect(service.getRequiredAuthContext("user-1", {
      tenantServiceAccess: "read",
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "EMPLOYEE_TENANT_MISSING",
    });
    expect(resolveForRoute).not.toHaveBeenCalled();
  });
});

function decision(
  overrides: Partial<TenantServiceAccessDecision>,
): TenantServiceAccessDecision {
  return {
    mode: "paid",
    accessLevel: "read_write",
    allowed: true,
    errorCode: null,
    reason: null,
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2027-08-01T00:00:00.000Z",
    ...overrides,
  };
}
