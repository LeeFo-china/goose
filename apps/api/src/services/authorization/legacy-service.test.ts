import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ErrorCodes } from "@/errors/error-codes";
import type { TenantBillingSubscriptionLockState } from "@/repositories/billing-subscriptions";
import type { AuthContext } from "@/services/authorization";

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

const getTenantLockState = mock(
  async (): Promise<TenantBillingSubscriptionLockState> => ({
  locked: false as const,
  subscription: null,
}),
);

async function createAuthorizationService(
  authContext: AuthContext = tenantAuthContext,
) {
  const { AuthorizationService } = await import("./legacy-service");
  const service = new AuthorizationService({
    billingSubscriptionService: { getTenantLockState },
  });
  service.getAuthContextByAuthUserId = mock(async () => authContext);
  return service;
}

describe("AuthorizationService billing lock guard", () => {
  beforeEach(() => {
    getTenantLockState.mockClear();
    getTenantLockState.mockImplementation(async () => ({
      locked: false,
      subscription: null,
    }));
  });

  test("blocks tenant business requests when subscription is locked", async () => {
    getTenantLockState.mockImplementationOnce(async () => ({
      locked: true,
      reason: "credits_insufficient",
      locked_at: "2026-07-03T00:00:00.000Z",
      last_invoice_id: "invoice-1",
      subscription: {
        id: "subscription-1",
        tenant_id: "tenant-1",
        status: "locked",
        locked_at: "2026-07-03T00:00:00.000Z",
        lock_reason: "credits_insufficient",
        last_invoice_id: "invoice-1",
      },
    }));
    const service = await createAuthorizationService();

    await expect(service.getRequiredAuthContext("user-1")).rejects.toMatchObject({
      statusCode: 402,
      code: ErrorCodes.TENANT_BILLING_LOCKED,
      details: {
        tenant_id: "tenant-1",
        lock_reason: "credits_insufficient",
        locked_at: "2026-07-03T00:00:00.000Z",
        last_invoice_id: "invoice-1",
      },
    });
  });

  test("allows billing recharge permissions when subscription is locked", async () => {
    getTenantLockState.mockImplementationOnce(async () => ({
      locked: true,
      reason: "credits_insufficient",
      locked_at: "2026-07-03T00:00:00.000Z",
      last_invoice_id: "invoice-1",
      subscription: {
        id: "subscription-1",
        tenant_id: "tenant-1",
        status: "locked",
        locked_at: "2026-07-03T00:00:00.000Z",
        lock_reason: "credits_insufficient",
        last_invoice_id: "invoice-1",
      },
    }));
    const service = await createAuthorizationService();

    const authContext = await service.getRequiredAuthContext("user-1", {
      allowedWhenBillingLocked: true,
    });

    expect(authContext.tenantId).toBe("tenant-1");
  });

  test("does not check billing lock for platform admins", async () => {
    const service = await createAuthorizationService(platformAuthContext);

    const authContext = await service.getRequiredAuthContext("platform-user");

    expect(authContext.isPlatformAdmin).toBe(true);
    expect(getTenantLockState).not.toHaveBeenCalled();
  });
});
