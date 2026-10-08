import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type {
  PlatformTenantInitializationResult,
  PlatformTenantRecord,
  PlatformTenantUsageStats,
} from "@/repositories/platform-tenants/legacy/shared";
import type { PlatformAuditLogCreateInput } from "@/repositories/platform-audit-logs";
import { CreatePlatformTenantSchema } from "@/schema/platform-tenants";
import type { AuthContext } from "@/services/authorization";
import type { TenantServiceAccessFacts } from "@/repositories/tenant-service-access";
import type { PlatformTenantAtomicCreateResult } from "@/repositories/platform-tenants/legacy/commands";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenant = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "晴天装饰",
  slug: "sunny-decoration",
  status: "active",
  address: null,
  address_title: null,
  address_poi_id: null,
  address_province: null,
  address_city: null,
  address_district: null,
  address_adcode: null,
  address_latitude: null,
  address_longitude: null,
  address_source: null,
  address_confidence: null,
  address_confirmed_at: null,
  contact_name: "王总",
  contact_phone: "13900139000",
  unified_social_credit_code: null,
  created_at: "2026-08-30T08:00:00.000Z",
  updated_at: "2026-08-30T08:00:00.000Z",
} satisfies PlatformTenantRecord;

const initialization = {
  template_code: "default_decoration_company",
  template_version: "2026.08.30",
  departments_count: 42,
  posts_count: 48,
  roles_count: 11,
  admin_employee_id: "22222222-2222-4222-8222-222222222222",
  admin_role_id: "33333333-3333-4333-8333-333333333333",
} as const satisfies PlatformTenantInitializationResult;

const usage = {
  employee_count: 1,
  customer_count: 0,
  project_count: 0,
  h5_page_count: 0,
  camera_count: 0,
} satisfies PlatformTenantUsageStats;

const input = CreatePlatformTenantSchema.parse({
  name: tenant.name,
  slug: tenant.slug,
  contact_name: tenant.contact_name,
  contact_phone: tenant.contact_phone,
  admin: {
    name: "王总",
    phone: "13900139000",
  },
});

const authContext = {
  authUserId: "44444444-4444-4444-8444-444444444444",
  employeeId: "55555555-5555-4555-8555-555555555555",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: false,
  isPlatformStaff: true,
  isPlatformSuperAdmin: false,
  adminAuthVersion: 1,
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
  permissions: [{ code: "platform.tenant.manage", scope: "all" }],
} satisfies AuthContext;

const findBySlug = mock(async () => null as PlatformTenantRecord | null);
const findEmployeesByPhone = mock(async () => [] as Array<{ id: string }>);
const createWithDefaultTemplate = mock(async (): Promise<PlatformTenantAtomicCreateResult> => ({ tenant, initialization }));
const list = mock(async () => ({ list: [tenant], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
const accessFacts: TenantServiceAccessFacts = {
  evaluatedAt: "2026-10-07T08:00:00Z", tenantStatus: "active",
  serviceAccessPolicy: "entitlement_required", contract: null,
  paidOnboardingOrder: null, legacySubscriptionStatus: null,
  currentTrial: null, latestTrial: null,
};
const getByTenantIds = mock(async () => new Map([[tenant.id, accessFacts]]));
const initializeDefaultData = mock(async () => initialization);
const getUsageStats = mock(async () => new Map([[tenant.id, usage]]));
const recordBestEffort = mock(async (_input: PlatformAuditLogCreateInput) => null);
const isTrialAccessEnabled = mock(async () => true);
const assertPermission = mock((context: AuthContext, code: string) => {
  if (!context.permissions.some((permission) => permission.code === code)) {
    throw Errors.business(403, "缺少平台操作权限", "PLATFORM_PERMISSION_REQUIRED");
  }
});

mock.module("@/repositories/platform-tenants", () => ({
  platformTenantRepository: {
    list,
    findBySlug,
    findEmployeesByPhone,
    createWithDefaultTemplate,
    initializeDefaultData,
    getUsageStats,
  },
}));

mock.module("@/repositories/tenant-service-access-batch", () => ({
  tenantServiceAccessBatchRepository: { getByTenantIds },
}));

mock.module("@/services/platform-audit-logs", () => ({
  platformAuditLogService: { recordBestEffort },
}));

mock.module("@/services/platform-authorization", () => ({
  platformAuthorizationService: { assertPermission },
}));

mock.module("@/services/platform-service-trial-rollout", () => ({
  platformServiceTrialRollout: { isAccessEnabled: isTrialAccessEnabled },
}));

async function getService() {
  const { platformTenantService } = await import("./platform-tenants");
  return platformTenantService;
}

describe("PlatformTenantService.create", () => {
  beforeEach(() => {
    findBySlug.mockClear();
    findEmployeesByPhone.mockClear();
    createWithDefaultTemplate.mockClear();
    initializeDefaultData.mockClear();
    getUsageStats.mockClear();
    recordBestEffort.mockClear();
    assertPermission.mockClear();
    isTrialAccessEnabled.mockClear();
    isTrialAccessEnabled.mockImplementation(async () => true);
    findBySlug.mockImplementation(async () => null);
    findEmployeesByPhone.mockImplementation(async () => []);
    createWithDefaultTemplate.mockImplementation(async () => ({ tenant, initialization }));
    getUsageStats.mockImplementation(async () => new Map([[tenant.id, usage]]));
  });

  test("creates atomically after fast prechecks and preserves usage and audits", async () => {
    findBySlug.mockImplementationOnce(async () => {
      expect(assertPermission).toHaveBeenCalledWith(
        authContext,
        "platform.tenant.manage",
      );
      return null;
    });
    const service = await getService();

    const result = await service.create(input, authContext);

    expect(findBySlug).toHaveBeenCalledWith(input.slug);
    expect(findEmployeesByPhone).toHaveBeenCalledWith("13900139000");
    expect(createWithDefaultTemplate).toHaveBeenCalledTimes(1);
    expect(createWithDefaultTemplate).toHaveBeenCalledWith(input, {
      operatorEmployeeId: authContext.employeeId,
      manual: true,
      allowOverride: false,
    });
    expect(initializeDefaultData).not.toHaveBeenCalled();
    expect(getUsageStats).toHaveBeenCalledWith([tenant.id]);
    expect(recordBestEffort).toHaveBeenCalledTimes(2);
    expect(recordBestEffort.mock.calls[0]?.[0]).toMatchObject({
      action: "tenant_create",
      metadata: { initialization },
    });
    expect(result).toEqual({ ...tenant, usage, initialization, trial: null });
  });

  test("rejects missing permission before repository calls", async () => {
    const service = await getService();
    const forbiddenContext = { ...authContext, permissions: [] };

    await expect(service.create(input, forbiddenContext)).rejects.toMatchObject({
      statusCode: 403,
      code: "PLATFORM_PERMISSION_REQUIRED",
    });

    expect(findBySlug).not.toHaveBeenCalled();
    expect(findEmployeesByPhone).not.toHaveBeenCalled();
    expect(createWithDefaultTemplate).not.toHaveBeenCalled();
  });

  test.each([undefined, { version: 1, capabilities: ["core.projects"] }])(
    "requires trial management permission before creating a tenant with scope %j", async (scope) => {
    const service = await getService();
    const trialInput = CreatePlatformTenantSchema.parse({
      name: tenant.name,
      slug: tenant.slug,
      trial: {
        enabled: true,
        trial_days: 30,
        reason: "平台建户试用",
        scope,
        idempotency_key: "66666666-6666-4666-8666-666666666666",
      },
    });
    await expect(service.create(trialInput, authContext)).rejects.toMatchObject({
      statusCode: 403,
      code: "PLATFORM_PERMISSION_REQUIRED",
    });
    expect(createWithDefaultTemplate).not.toHaveBeenCalled();
  });

  test.each([undefined, { version: 1, capabilities: ["core.projects"] }])(
    "forwards optional scope %j and returns authoritative trial dates", async (scope) => {
    const trial = { id: "66666666-6666-4666-8666-666666666666", status: "active" as const,
      trial_ends_at: "2026-11-06T08:00:00Z", grace_ends_at: "2026-11-13T08:00:00Z" };
    createWithDefaultTemplate.mockResolvedValueOnce({ tenant, initialization, trial });
    const withTrial = CreatePlatformTenantSchema.parse({ ...input, trial: {
      scope,
      enabled: true, trial_days: 30, reason: "客户评估", idempotency_key: crypto.randomUUID(),
    } });
    const service = await getService();
    const result = await service.create(withTrial, { ...authContext, permissions: [
      ...authContext.permissions,
      { code: "platform.service_trial.manage", scope: "all" },
      { code: "platform.service_trial.override", scope: "all" },
    ] });
    expect(result.trial).toEqual(trial);
    expect(createWithDefaultTemplate).toHaveBeenCalledWith(withTrial, {
      operatorEmployeeId: authContext.employeeId, manual: true, allowOverride: true,
    });
  });

  test("rejects trial creation when rollout is disabled before any tenant write", async () => {
    isTrialAccessEnabled.mockResolvedValueOnce(false);
    const service = await getService();
    await expect(service.create(CreatePlatformTenantSchema.parse({ ...input, trial: {
      enabled: true, trial_days: 30, reason: "客户评估", idempotency_key: crypto.randomUUID(),
    } }), { ...authContext, permissions: [...authContext.permissions,
      { code: "platform.service_trial.manage", scope: "all" }] }))
      .rejects.toMatchObject({ code: "SERVICE_TRIAL_ACCESS_DISABLED" });
    expect(createWithDefaultTemplate).not.toHaveBeenCalled();
  });

  test("rejects an existing slug before phone lookup or atomic creation", async () => {
    findBySlug.mockImplementationOnce(async () => tenant);
    const service = await getService();

    await expect(service.create(input, authContext)).rejects.toMatchObject({
      statusCode: 409,
      code: "TENANT_SLUG_EXISTS",
    });

    expect(findEmployeesByPhone).not.toHaveBeenCalled();
    expect(createWithDefaultTemplate).not.toHaveBeenCalled();
  });

  test("rejects an existing admin phone before atomic creation", async () => {
    findEmployeesByPhone.mockImplementationOnce(async () => [{ id: "employee-existing" }]);
    const service = await getService();

    await expect(service.create(input, authContext)).rejects.toMatchObject({
      statusCode: 409,
      code: "TENANT_ADMIN_PHONE_EXISTS",
    });

    expect(createWithDefaultTemplate).not.toHaveBeenCalled();
    expect(getUsageStats).not.toHaveBeenCalled();
    expect(recordBestEffort).not.toHaveBeenCalled();
  });

  test("does not query usage or audit when atomic creation fails", async () => {
    createWithDefaultTemplate.mockImplementationOnce(async () => {
      throw Errors.dbError("创建租户并初始化模板失败");
    });
    const service = await getService();

    await expect(service.create(input, authContext)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });

    expect(createWithDefaultTemplate).toHaveBeenCalledTimes(1);
    expect(initializeDefaultData).not.toHaveBeenCalled();
    expect(getUsageStats).not.toHaveBeenCalled();
    expect(recordBestEffort).not.toHaveBeenCalled();
  });
});

describe("PlatformTenantService.list", () => {
  test.each(["active", "grace_period"] as const)("allows extending %s only with manage and override", async (status) => {
    const currentTrial = {
      id: "66666666-6666-4666-8666-666666666666", tenant_id: tenant.id,
      source: "platform_grant" as const, status,
      starts_at: "2026-09-07T08:00:00Z", trial_ends_at: "2026-10-07T08:00:00Z",
      grace_ends_at: "2026-10-14T08:00:00Z",
      scope_snapshot: { version: 1 as const, capabilities: ["core.projects" as const] },
    };
    const facts = { ...accessFacts, currentTrial, latestTrial: { ...currentTrial, version: 2 } };
    getByTenantIds.mockResolvedValueOnce(new Map([[tenant.id, facts]]));
    const service = await getService();
    const permissions = ["platform.tenant.read", "platform.service_trial.manage", "platform.service_trial.override"]
      .map((code) => ({ code, scope: "all" as const }));
    const result = await service.list({ page: 1, pageSize: 20 }, { ...authContext, permissions });
    expect(result.list[0]?.service_access).toMatchObject({
      mode: status === "active" ? "trial" : "grace", can_extend: true, version: 2,
      trial_id: currentTrial.id, grace_ends_at: currentTrial.grace_ends_at,
    });
    getByTenantIds.mockResolvedValueOnce(new Map([[tenant.id, facts]]));
    const restricted = await service.list({ page: 1, pageSize: 20 }, {
      ...authContext, permissions: permissions.filter((item) => !item.code.endsWith("override")),
    });
    expect(restricted.list[0]?.service_access.can_extend).toBe(false);
  });

  test.each([
    ["entitlement_required", "service_blocked"],
    ["legacy_compatible", "legacy"],
  ] as const)("projects %s without inventing a subscription", async (policy, mode) => {
    getByTenantIds.mockResolvedValueOnce(new Map([[tenant.id, { ...accessFacts, serviceAccessPolicy: policy }]]));
    const service = await getService();
    const result = await service.list({ page: 1, pageSize: 20 }, { ...authContext,
      permissions: [{ code: "platform.tenant.read", scope: "all" }] });
    expect(getByTenantIds).toHaveBeenCalledWith([tenant.id]);
    expect(result.list[0]?.service_access.mode).toBe(mode);
    expect(result.trial_creation.enabled).toBe(false);
    expect(result.list[0]?.service_access.can_extend).toBe(false);
  });
});
