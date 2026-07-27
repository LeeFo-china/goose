import { beforeAll, describe, expect, mock, test } from "bun:test";
import { AppError } from "../errors/app-error";
import type { TenantEntitlementRecord } from "@/repositories/tenant-entitlements";
import type { AuthContext } from "@/services/authorization";
import type { TenantEntitlementsServiceDependencies } from "./tenant-entitlements";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
let TenantEntitlementsService:
  typeof import("./tenant-entitlements").TenantEntitlementsService;
beforeAll(async () => {
  ({ TenantEntitlementsService } = await import("./tenant-entitlements"));
});
const NOW = new Date("2026-07-27T10:00:00.000Z");
const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000002";
const USER_ID = "00000000-0000-4000-8000-000000000003";
const platformAuthContext = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [{
    code: "platform.tenant_entitlement.manage",
    scope: "all",
  }],
} satisfies AuthContext;
const tenantAuthContext = {
  ...platformAuthContext,
  tenantId: TENANT_ID,
  tenantName: "晴天装饰",
  tenantSlug: "sunny",
  tenantStatus: "active",
  isPlatformAdmin: false,
  roleCodes: ["tenant_admin"],
  permissions: [{ code: "brand.settings.update", scope: "all" }],
} satisfies AuthContext;
const tenant = {
  id: TENANT_ID,
  name: "晴天装饰",
  status: "active",
};

const entitlement = {
  id: "00000000-0000-4000-8000-000000000010",
  tenant_id: TENANT_ID,
  entitlement_code: "custom_support_branding",
  status: "active",
  starts_at: "2026-07-27T10:00:00.000Z",
  expires_at: "2027-07-27T10:00:00.000Z",
  source_type: "manual_grant",
  source_id: null,
  suspended_at: null,
  suspend_reason: null,
  version: 1,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: "2026-07-27T10:00:00.000Z",
  updated_at: "2026-07-27T10:00:00.000Z",
} satisfies TenantEntitlementRecord;

function databaseError(details: unknown) {
  return new AppError(500, "执行租户权益操作失败", "DB_ERROR", details);
}
function createFixture(options: {
  current?: TenantEntitlementRecord | null;
  tenantStatus?: string;
  expireFailure?: unknown;
  applyFailure?: unknown;
  applyResult?: TenantEntitlementRecord;
} = {}) {
  const current = options.current === undefined ? entitlement : options.current;
  const findTenant = mock(async (): Promise<typeof tenant | null> => ({
    ...tenant,
    status: options.tenantStatus ?? tenant.status,
  }));
  const listByTenant = mock(async () => ({
    rows: current ? [current] : [],
    total: current ? 1 : 0,
  }));
  const findByCode = mock(async () => current);
  const expireIfDue = mock(async () => {
    if (options.expireFailure) throw options.expireFailure;
    return current;
  });
  const applyAction = mock(async () => {
    if (options.applyFailure) throw options.applyFailure;
    return options.applyResult ?? entitlement;
  });
  const hasPermission = mock((
    authContext: AuthContext,
    permissionCode: string,
  ) => authContext.permissions.some(({ code }) => code === permissionCode));
  const assertTenantContext = mock((authContext: AuthContext) => {
    if (!authContext.tenantId) {
      throw new AppError(
        403,
        "当前操作必须在租户上下文中执行",
        "TENANT_CONTEXT_REQUIRED",
      );
    }
    return authContext.tenantId;
  });
  const dependencies = {
    entitlementRepository: {
      listByTenant,
      findByCode,
      applyAction,
      expireIfDue,
    },
    brandingRepository: { findTenant },
    accessPolicyService: { hasPermission, assertTenantContext },
  } satisfies TenantEntitlementsServiceDependencies;
  return {
    service: new TenantEntitlementsService(dependencies),
    applyAction,
    assertTenantContext,
    expireIfDue,
    findByCode,
    findTenant,
    hasPermission,
    listByTenant,
  };
}
describe("TenantEntitlementsService platform access", () => {
  test("requires both platform-admin identity and manage permission", async () => {
    const fixture = createFixture();
    const tenantEmployee = {
      ...platformAuthContext,
      isPlatformAdmin: false,
    };
    const platformWithoutPermission = {
      ...platformAuthContext,
      permissions: [],
    };
    await expect(fixture.service.listPlatform(
      tenantEmployee,
      TENANT_ID,
      { page: 1, pageSize: 20 },
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(fixture.service.listPlatform(
      platformWithoutPermission,
      TENANT_ID,
      { page: 1, pageSize: 20 },
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(fixture.findTenant).not.toHaveBeenCalled();
  });

  test("validates tenant existence and returns the serialized bounded page", async () => {
    const fixture = createFixture();
    await expect(fixture.service.listPlatform(
      platformAuthContext,
      TENANT_ID,
      { page: 2, pageSize: 10 },
    )).resolves.toEqual({
      list: [{
        id: entitlement.id,
        tenant_id: TENANT_ID,
        code: "custom_support_branding",
        status: "active",
        starts_at: entitlement.starts_at,
        expires_at: entitlement.expires_at,
        source_type: "manual_grant",
        source_id: null,
        suspended_at: null,
        suspend_reason: null,
        version: 1,
        updated_at: entitlement.updated_at,
      }],
      pagination: {
        page: 2,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      },
    });
    expect(fixture.findTenant).toHaveBeenCalledWith(TENANT_ID);
    expect(fixture.listByTenant).toHaveBeenCalledWith(
      TENANT_ID,
      { page: 2, pageSize: 10 },
    );
  });

  test("does not query entitlements when the tenant does not exist", async () => {
    const fixture = createFixture();
    fixture.findTenant.mockImplementation(async () => null);
    await expect(fixture.service.listPlatform(
      platformAuthContext,
      TENANT_ID,
      { page: 1, pageSize: 20 },
    )).rejects.toMatchObject({ statusCode: 404 });
    expect(fixture.listByTenant).not.toHaveBeenCalled();
  });
});
describe("TenantEntitlementsService actions", () => {
  test("grant defaults to one year and takes the actor only from AuthContext", async () => {
    const fixture = createFixture({ current: null });

    await fixture.service.grant(platformAuthContext, TENANT_ID, {
      reason: "平台赠送一年品牌权益",
    });

    expect(fixture.applyAction).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      entitlementCode: "custom_support_branding",
      action: "grant",
      termYears: 1,
      reason: "平台赠送一年品牌权益",
      expectedVersion: 0,
      actorEmployeeId: EMPLOYEE_ID,
      actorUserId: USER_ID,
    });
  });

  test("maps an active grant RPC conflict instead of leaking SQL details", async () => {
    const fixture = createFixture({
      applyFailure: databaseError({
        code: "P0001",
        message: "Tenant entitlement state conflict",
        details: "TENANT_ENTITLEMENT_STATE_CONFLICT",
      }),
    });

    await expect(fixture.service.grant(
      platformAuthContext,
      TENANT_ID,
      { term_years: 2, reason: "继续赠送" },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "TENANT_ENTITLEMENT_STATE_CONFLICT",
      details: undefined,
    });
  });

  test("suspend and revoke pass exact versions, reasons, and AuthContext actor", async () => {
    const fixture = createFixture();

    await fixture.service.suspend(platformAuthContext, TENANT_ID, {
      version: 3,
      reason: "品牌内容待核验",
    });
    await fixture.service.revoke(platformAuthContext, TENANT_ID, {
      version: 4,
      reason: "租户主动终止服务",
      confirm: true,
    });

    expect(fixture.applyAction).toHaveBeenNthCalledWith(1, {
      tenantId: TENANT_ID,
      entitlementCode: "custom_support_branding",
      action: "suspend",
      termYears: null,
      reason: "品牌内容待核验",
      expectedVersion: 3,
      actorEmployeeId: EMPLOYEE_ID,
      actorUserId: USER_ID,
    });
    expect(fixture.applyAction).toHaveBeenNthCalledWith(2, {
      tenantId: TENANT_ID,
      entitlementCode: "custom_support_branding",
      action: "revoke",
      termYears: null,
      reason: "租户主动终止服务",
      expectedVersion: 4,
      actorEmployeeId: EMPLOYEE_ID,
      actorUserId: USER_ID,
    });
  });

  test("resume reconciles expiry first and preserves the original expiry", async () => {
    const suspended = {
      ...entitlement,
      status: "suspended",
      version: 2,
      suspended_at: "2026-08-01T00:00:00.000Z",
      suspend_reason: "待核验",
    } satisfies TenantEntitlementRecord;
    const resumed = {
      ...suspended,
      status: "active",
      version: 3,
      suspended_at: null,
      suspend_reason: null,
    } satisfies TenantEntitlementRecord;
    const fixture = createFixture({ current: suspended, applyResult: resumed });

    await expect(fixture.service.resume(
      platformAuthContext,
      TENANT_ID,
      { version: 2, reason: "品牌内容已核验" },
      NOW,
    )).resolves.toEqual({
      entitlement: expect.objectContaining({
        status: "active",
        expires_at: suspended.expires_at,
      }),
    });
    expect(fixture.expireIfDue).toHaveBeenCalledWith(
      TENANT_ID,
      "custom_support_branding",
      NOW,
    );
    expect(fixture.applyAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "resume",
        expectedVersion: 2,
        actorEmployeeId: EMPLOYEE_ID,
        actorUserId: USER_ID,
      }),
    );
  });

  test("fails closed when a resume result extends the original expiry", async () => {
    const suspended = {
      ...entitlement,
      status: "suspended",
      version: 2,
    } satisfies TenantEntitlementRecord;
    const extended = {
      ...entitlement,
      version: 3,
      expires_at: "2028-07-27T10:00:00.000Z",
    } satisfies TenantEntitlementRecord;
    const fixture = createFixture({ current: suspended, applyResult: extended });

    await expect(fixture.service.resume(
      platformAuthContext,
      TENANT_ID,
      { version: 2, reason: "恢复权益" },
      NOW,
    )).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test("does not resume an entitlement reconciled as expired", async () => {
    const expired = {
      ...entitlement,
      status: "expired",
      expires_at: NOW.toISOString(),
      version: 3,
    } satisfies TenantEntitlementRecord;
    const fixture = createFixture({ current: expired });

    await expect(fixture.service.resume(
      platformAuthContext,
      TENANT_ID,
      { version: 3, reason: "恢复权益" },
      NOW,
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ENTITLEMENT_EXPIRED",
    });
    expect(fixture.applyAction).not.toHaveBeenCalled();
  });

  test("maps RPC not-found, version, state, and expiry errors", async () => {
    const cases = [
      ["TENANT_ENTITLEMENT_NOT_FOUND", 404],
      ["TENANT_ENTITLEMENT_VERSION_CONFLICT", 409],
      ["TENANT_ENTITLEMENT_STATE_CONFLICT", 409],
      ["BRANDING_ENTITLEMENT_EXPIRED", 409],
    ] as const;

    for (const [code, statusCode] of cases) {
      const fixture = createFixture({
        applyFailure: databaseError({
          code: "P0001",
          details: code,
          message: "internal SQL message",
        }),
      });
      await expect(fixture.service.suspend(
        platformAuthContext,
        TENANT_ID,
        { version: 1, reason: "平台操作原因" },
      )).rejects.toMatchObject({ statusCode, code, details: undefined });
    }
    const messageFixture = createFixture({
      applyFailure: databaseError(
        new Error("TENANT_ENTITLEMENT_VERSION_CONFLICT"),
      ),
    });
    await expect(messageFixture.service.suspend(
      platformAuthContext,
      TENANT_ID,
      { version: 1, reason: "平台操作原因" },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "TENANT_ENTITLEMENT_VERSION_CONFLICT",
    });
  });

  test("keeps unknown repository errors unchanged", async () => {
    const failure = databaseError({ code: "XX000", message: "unexpected" });
    const fixture = createFixture({ applyFailure: failure });

    await expect(fixture.service.suspend(
      platformAuthContext,
      TENANT_ID,
      { version: 1, reason: "平台操作原因" },
    )).rejects.toBe(failure);
  });
});

describe("TenantEntitlementsService tenant customization", () => {
  test("takes tenant ID from AuthContext and returns an active summary", async () => {
    const fixture = createFixture();

    await expect(fixture.service.assertCanCustomize(
      tenantAuthContext,
      NOW,
    )).resolves.toEqual({
      tenantId: TENANT_ID,
      entitlement: expect.objectContaining({
        code: "custom_support_branding",
        status: "active",
      }),
    });
    expect(fixture.assertTenantContext).toHaveBeenCalledWith(tenantAuthContext);
    expect(fixture.expireIfDue).toHaveBeenCalledWith(
      TENANT_ID,
      "custom_support_branding",
      NOW,
    );
  });

  test("requires brand update permission before querying entitlement state", async () => {
    const fixture = createFixture();
    const unauthorized = { ...tenantAuthContext, permissions: [] };

    await expect(fixture.service.assertCanCustomize(
      unauthorized,
      NOW,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(fixture.expireIfDue).not.toHaveBeenCalled();
  });

  test("distinguishes missing, suspended, expired, and revoked entitlements", async () => {
    const cases = [
      [null, "BRANDING_ENTITLEMENT_REQUIRED"],
      [{ ...entitlement, status: "suspended" }, "BRANDING_ENTITLEMENT_SUSPENDED"],
      [{ ...entitlement, status: "expired" }, "BRANDING_ENTITLEMENT_EXPIRED"],
      [{ ...entitlement, status: "revoked" }, "BRANDING_ENTITLEMENT_REVOKED"],
    ] as const;

    for (const [current, code] of cases) {
      const fixture = createFixture({
        current: current as TenantEntitlementRecord | null,
      });
      await expect(fixture.service.assertCanCustomize(
        tenantAuthContext,
        NOW,
      )).rejects.toMatchObject({ statusCode: 403, code });
    }
  });

  test("treats an active row at the expiry boundary as expired", async () => {
    const fixture = createFixture({
      current: { ...entitlement, expires_at: NOW.toISOString() },
    });

    await expect(fixture.service.assertCanCustomize(
      tenantAuthContext,
      NOW,
    )).rejects.toMatchObject({
      statusCode: 403,
      code: "BRANDING_ENTITLEMENT_EXPIRED",
    });
  });

  test("propagates expiry reconciliation failure and never authorizes stale active data", async () => {
    const failure = databaseError({
      code: "08006",
      message: "connection failure",
    });
    const fixture = createFixture({
      current: { ...entitlement, expires_at: NOW.toISOString() },
      expireFailure: failure,
    });

    await expect(fixture.service.assertCanCustomize(
      tenantAuthContext,
      NOW,
    )).rejects.toBe(failure);
    expect(fixture.findByCode).not.toHaveBeenCalled();
  });
});
