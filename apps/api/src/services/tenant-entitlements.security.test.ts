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

const entitlement = {
  id: "00000000-0000-4000-8000-000000000010",
  tenant_id: TENANT_ID,
  entitlement_code: "custom_support_branding",
  status: "active",
  starts_at: "2026-07-27T09:00:00.000Z",
  expires_at: "2027-07-27T10:00:00.000Z",
  source_type: "manual_grant",
  source_id: null,
  suspended_at: null,
  suspend_reason: null,
  version: 1,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: "2026-07-27T09:00:00.000Z",
  updated_at: "2026-07-27T09:00:00.000Z",
} satisfies TenantEntitlementRecord;

function databaseError(details: unknown) {
  return new AppError(500, "底层数据库异常", "DB_ERROR", details);
}

function createFixture(options: {
  current?: TenantEntitlementRecord | null;
  tenantFailure?: unknown;
  findFailure?: unknown;
  expireFailure?: unknown;
  expireResult?: TenantEntitlementRecord | null;
  applyFailure?: unknown;
  applyResult?: TenantEntitlementRecord;
} = {}) {
  const current = options.current === undefined ? entitlement : options.current;
  const findTenant = mock(async () => {
    if (options.tenantFailure) throw options.tenantFailure;
    return {
      id: TENANT_ID,
      name: "晴天装饰",
      status: "active",
    };
  });
  const listByTenant = mock(async () => ({ rows: [], total: 0 }));
  const findByCode = mock(async () => {
    if (options.findFailure) throw options.findFailure;
    return current;
  });
  const expireIfDue = mock(async () => {
    if (options.expireFailure) throw options.expireFailure;
    return options.expireResult === undefined
      ? current
      : options.expireResult;
  });
  const applyAction = mock(async () => {
    if (options.applyFailure) throw options.applyFailure;
    return options.applyResult ?? entitlement;
  });
  const dependencies = {
    entitlementRepository: {
      listByTenant,
      findByCode,
      expireIfDue,
      applyAction,
    },
    brandingRepository: { findTenant },
    accessPolicyService: {
      hasPermission: mock(() => true),
      assertTenantContext: mock(() => TENANT_ID),
    },
  } satisfies TenantEntitlementsServiceDependencies;

  return {
    service: new TenantEntitlementsService(dependencies),
    applyAction,
    expireIfDue,
    findByCode,
    listByTenant,
  };
}

describe("tenant lookup security boundary", () => {
  test("sanitizes tenant lookup failures for platform list and actions", async () => {
    const failure = databaseError({
      code: "42P01",
      message: "relation private_tenants does not exist",
      details: "table=private_tenants",
      hint: "SELECT secret FROM private_tenants",
    });
    const listFixture = createFixture({ tenantFailure: failure });
    const actionFixture = createFixture({ tenantFailure: failure });

    await expect(listFixture.service.listPlatform(
      platformAuthContext,
      TENANT_ID,
      { page: 1, pageSize: 20 },
    )).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "租户查询失败",
      details: undefined,
    });
    await expect(actionFixture.service.suspend(
      platformAuthContext,
      TENANT_ID,
      { version: 1, reason: "平台操作原因" },
    )).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "租户查询失败",
      details: undefined,
    });
    expect(listFixture.listByTenant).not.toHaveBeenCalled();
    expect(actionFixture.applyAction).not.toHaveBeenCalled();
  });
});

describe("tenant entitlement summary query boundary", () => {
  test("sanitizes find failures without attempting expiry reconciliation", async () => {
    const fixture = createFixture({
      findFailure: databaseError({
        code: "42P01",
        message: "relation private_entitlements does not exist",
        details: "password=secret",
        hint: "SELECT * FROM private_entitlements",
      }),
    });

    await expect(fixture.service.getTenantSummary(TENANT_ID, NOW))
      .rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        message: "租户权益查询失败",
        details: undefined,
      });
    expect(fixture.findByCode).toHaveBeenCalledTimes(1);
    expect(fixture.expireIfDue).not.toHaveBeenCalled();
  });

  test("sanitizes due-expiry RPC failures and remains fail closed", async () => {
    const due = { ...entitlement, expires_at: NOW.toISOString() };
    const fixture = createFixture({
      current: due,
      expireFailure: databaseError({
        code: "XX000",
        message: "lock failure on internal row",
        details: "database topology",
      }),
    });

    await expect(fixture.service.getTenantSummary(TENANT_ID, NOW))
      .rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        message: "租户权益查询失败",
        details: undefined,
      });
    expect(fixture.findByCode).toHaveBeenCalledTimes(1);
    expect(fixture.expireIfDue).toHaveBeenCalledTimes(1);
  });

  test("does not lock future or terminal entitlement rows", async () => {
    const cases = [
      entitlement,
      { ...entitlement, status: "suspended" },
      { ...entitlement, status: "expired" },
      { ...entitlement, status: "revoked" },
      null,
    ] as const;

    for (const current of cases) {
      const fixture = createFixture({
        current: current as TenantEntitlementRecord | null,
      });
      await fixture.service.getTenantSummary(TENANT_ID, NOW);
      expect(fixture.findByCode).toHaveBeenCalledTimes(1);
      expect(fixture.expireIfDue).not.toHaveBeenCalled();
    }
  });

  test("reconciles a due row once and uses the RPC result without rereading", async () => {
    const due = { ...entitlement, expires_at: NOW.toISOString() };
    const expired = {
      ...due,
      status: "expired",
      version: 2,
    } satisfies TenantEntitlementRecord;
    const fixture = createFixture({ current: due, expireResult: expired });

    await expect(fixture.service.getTenantSummary(TENANT_ID, NOW))
      .resolves.toMatchObject({
        entitlement: { status: "expired", version: 2 },
        isActive: false,
      });
    expect(fixture.findByCode).toHaveBeenCalledTimes(1);
    expect(fixture.expireIfDue).toHaveBeenCalledTimes(1);
  });

  test("fails closed when due-expiry RPC unexpectedly returns null", async () => {
    const fixture = createFixture({
      current: { ...entitlement, expires_at: NOW.toISOString() },
      expireResult: null,
    });

    await expect(fixture.service.getTenantSummary(TENANT_ID, NOW))
      .rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        message: "租户权益查询失败",
        details: undefined,
      });
    expect(fixture.findByCode).toHaveBeenCalledTimes(1);
    expect(fixture.expireIfDue).toHaveBeenCalledTimes(1);
  });
});

describe("tenant entitlement RPC error parsing", () => {
  test("maps a known code nested in real Supabase error fields", async () => {
    const fixture = createFixture({
      applyFailure: databaseError({
        code: "P0001",
        message: "Tenant entitlement version conflict",
        details: {
          code: "P0001",
          details: "TENANT_ENTITLEMENT_VERSION_CONFLICT",
        },
      }),
    });

    await expect(fixture.service.suspend(platformAuthContext, TENANT_ID, {
      version: 1,
      reason: "平台操作原因",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "TENANT_ENTITLEMENT_VERSION_CONFLICT",
    });
  });

  test("bounds circular, deeply nested, and large-array error details", async () => {
    const circular: Record<string, unknown> = { code: "P0001" };
    circular.details = circular;
    let deep: Record<string, unknown> = {
      details: "TENANT_ENTITLEMENT_STATE_CONFLICT",
    };
    for (let index = 0; index < 2_000; index += 1) {
      deep = { details: deep };
    }
    const large = Array.from({ length: 10_000 }, (_, index) => ({
      message: `node-${index}`,
    }));

    for (const details of [circular, deep, large]) {
      const fixture = createFixture({
        applyFailure: databaseError(details),
      });
      await expect(fixture.service.suspend(platformAuthContext, TENANT_ID, {
        version: 1,
        reason: "平台操作原因",
      })).rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        message: "租户权益操作失败",
        details: undefined,
      });
    }
  });

  test("does not map codes embedded in longer uppercase tokens", async () => {
    for (
      const details of [
        "TENANT_ENTITLEMENT_VERSION_CONFLICT_ARCHIVE",
        "X_TENANT_ENTITLEMENT_EXPIRED",
      ]
    ) {
      const fixture = createFixture({
        applyFailure: databaseError({ code: "P0001", details }),
      });
      await expect(fixture.service.suspend(platformAuthContext, TENANT_ID, {
        version: 1,
        reason: "平台操作原因",
      })).rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        message: "租户权益操作失败",
        details: undefined,
      });
    }
  });

  test("maps an exact token surrounded by safe delimiters", async () => {
    const fixture = createFixture({
      applyFailure: databaseError({
        code: "P0001",
        details:
          "RPC error: TENANT_ENTITLEMENT_VERSION_CONFLICT; retry request",
      }),
    });

    await expect(fixture.service.suspend(platformAuthContext, TENANT_ID, {
      version: 1,
      reason: "平台操作原因",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "TENANT_ENTITLEMENT_VERSION_CONFLICT",
    });
  });
});

describe("tenant entitlement resume expiry invariant", () => {
  test("accepts equivalent expiry instants expressed with different offsets", async () => {
    const suspended = {
      ...entitlement,
      status: "suspended",
      version: 2,
    } satisfies TenantEntitlementRecord;
    const resumed = {
      ...entitlement,
      expires_at: "2027-07-27T18:00:00+08:00",
      version: 3,
    } satisfies TenantEntitlementRecord;
    const fixture = createFixture({ current: suspended, applyResult: resumed });

    await expect(fixture.service.resume(
      platformAuthContext,
      TENANT_ID,
      { version: 2, reason: "恢复权益" },
      NOW,
    )).resolves.toMatchObject({
      entitlement: { expires_at: resumed.expires_at },
    });
  });

  test("rejects an invalid previous expiry before committing resume", async () => {
    const fixture = createFixture({
      current: {
        ...entitlement,
        status: "suspended",
        expires_at: "invalid-date",
      },
    });

    await expect(fixture.service.resume(
      platformAuthContext,
      TENANT_ID,
      { version: 1, reason: "恢复权益" },
      NOW,
    )).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "租户品牌权益到期时间无效",
      details: undefined,
    });
    expect(fixture.applyAction).not.toHaveBeenCalled();
  });

  test("rejects an invalid committed RPC result without leaking details", async () => {
    const suspended = {
      ...entitlement,
      status: "suspended",
    } satisfies TenantEntitlementRecord;
    const fixture = createFixture({
      current: suspended,
      applyResult: { ...entitlement, expires_at: "invalid-result" },
    });

    await expect(fixture.service.resume(
      platformAuthContext,
      TENANT_ID,
      { version: 1, reason: "恢复权益" },
      NOW,
    )).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "恢复租户品牌权益结果到期时间异常",
      details: undefined,
    });
    expect(fixture.applyAction).toHaveBeenCalledTimes(1);
  });
});
