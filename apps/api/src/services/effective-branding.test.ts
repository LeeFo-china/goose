import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { BrandProfileRecord } from "@/repositories/branding";
import type { BrandingPlatformFileObjectRecord } from "@/repositories/platform-file-objects";
import type { TenantEntitlementRecord } from "@/repositories/tenant-entitlements";
import type { AuthContext } from "@/services/authorization";
import type { EffectiveBranding } from "@/services/effective-branding";
import type { JwtPayload } from "@/utils/jwt";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
let EffectiveBrandingService: typeof import("./effective-branding").EffectiveBrandingService;
beforeAll(async () =>
  ({ EffectiveBrandingService } = await import("./effective-branding")));
const NOW = new Date("2026-07-27T10:00:00.000Z");
const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const CLAIM_TENANT_ID = "00000000-0000-4000-8000-000000000099";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000004";
const PLATFORM_LOGO_ID = "00000000-0000-4000-8000-000000000010";
const TENANT_LOGO_ID = "00000000-0000-4000-8000-000000000011";
const FALLBACK_LOGO_URL = "https://fallback.example.com/logo.png";
const databaseFailure = { code: "DB_ERROR", message: "sensitive db details" };
const platformProfile = {
  id: "00000000-0000-4000-8000-000000000020", scope: "platform",
  tenant_id: null, display_name: "未发布的平台草稿",
  logo_file_id: "00000000-0000-4000-8000-000000000099",
  published_display_name: "字节跳动", status: "published",
  published_logo_file_id: PLATFORM_LOGO_ID,
  version: 5, published_version: 4,
  published_at: "2026-07-27T09:00:00.000Z",
  updated_by_employee_id: USER_ID, created_at: "2026-07-27T08:00:00.000Z",
  updated_at: "2026-07-27T09:30:00.000Z",
} satisfies BrandProfileRecord;
const tenantProfile = {
  ...platformProfile, id: "00000000-0000-4000-8000-000000000021",
  scope: "tenant", tenant_id: TENANT_ID, display_name: "租户未发布草稿",
  logo_file_id: "00000000-0000-4000-8000-000000000098",
  published_display_name: "晴天装饰", published_logo_file_id: TENANT_LOGO_ID,
  version: 7, published_version: 6,
  published_at: "2026-07-27T09:15:00.000Z",
  updated_at: "2026-07-27T09:45:00.000Z",
} satisfies BrandProfileRecord;
function brandLogo(id: string, tenantId: string | null):
  BrandingPlatformFileObjectRecord {
  return {
    id, tenant_id: tenantId,
    owner_type: tenantId ? "employee" : "platform",
    owner_id: USER_ID, scene: "brand_logo", provider: "tencent_cos",
    bucket: "branding", region: "ap-guangzhou",
    object_key: `${tenantId ?? "platform"}/logo.png`,
    mime_type: "image/png", size_bytes: 1024, width: 256, height: 256,
    checksum: "sha256", visibility: "public",
    public_url: `https://cdn.example.com/${id}.png`,
    status: "active", deleted_at: null,
  };
}
const platformLogo = brandLogo(PLATFORM_LOGO_ID, null);
const tenantLogo = brandLogo(TENANT_LOGO_ID, TENANT_ID);
const tenant = {
  id: TENANT_ID, name: "晴天装饰", status: "active",
} as const;
const entitlement = {
  id: "00000000-0000-4000-8000-000000000030", tenant_id: TENANT_ID,
  entitlement_code: "custom_support_branding", status: "active",
  starts_at: "2026-07-27T09:00:00.000Z",
  expires_at: "2027-07-27T10:00:00.000Z",
  source_type: "manual_grant", source_id: null,
  suspended_at: null, suspend_reason: null, version: 1,
  updated_by_employee_id: USER_ID,
  created_at: "2026-07-27T09:00:00.000Z",
  updated_at: "2026-07-27T09:00:00.000Z",
} satisfies TenantEntitlementRecord;
const authContext = {
  authUserId: USER_ID, tenantId: TENANT_ID, tenantName: tenant.name,
  employeeId: "00000000-0000-4000-8000-000000000003",
  tenantSlug: "sunny", tenantStatus: "active", isPlatformAdmin: false,
  employeeName: "租户员工", employeeStatus: "active",
  departmentId: null, tenantDepartmentId: null,
  departmentCode: null, departmentName: null,
  postId: null, postName: null, avatar: null,
  roleCodes: ["employee"], roles: [], permissions: [],
} satisfies AuthContext;
type FixtureOptions = {
  platformProfile?: BrandProfileRecord | null;
  tenantProfile?: BrandProfileRecord | null;
  platformLogo?: BrandingPlatformFileObjectRecord | null;
  tenantLogo?: BrandingPlatformFileObjectRecord | null;
  entitlement?: TenantEntitlementRecord | null;
  summaryIsActive?: boolean;
  summaryTenantId?: string;
  summaryTenantStatus?: string;
  platformProfileFailure?: boolean;
  entitlementFailure?: boolean;
  tenantProfileFailure?: boolean;
  platformLogoFailure?: boolean;
  tenantLogoFailure?: boolean;
  authFailure?: boolean;
  authContext?: AuthContext;
  fallbackLogoUrl?: string | null;
  runtimeEnvironment?: string;
  summaryEntitlementOverrides?: Partial<{
    tenant_id: string; code: string; version: number;
    starts_at: string; expires_at: string;
  }>;
  logoUrlResolver?: (
    file: BrandingPlatformFileObjectRecord,
  ) => string | null | Promise<string | null>;
};
function fixture(options: FixtureOptions = {}) {
  const calls: string[] = [];
  const findPlatformProfile = mock(async () => {
    calls.push("platform-profile");
    if (options.platformProfileFailure) throw databaseFailure;
    return options.platformProfile === undefined
      ? platformProfile
      : options.platformProfile;
  });
  const findTenantProfile = mock(async () => {
    calls.push("tenant-profile");
    if (options.tenantProfileFailure) throw databaseFailure;
    return options.tenantProfile === undefined ? tenantProfile : options.tenantProfile;
  });
  const findPlatformBrandLogoForBinding = mock(async () => {
    calls.push("platform-logo");
    if (options.platformLogoFailure) throw databaseFailure;
    return options.platformLogo === undefined ? platformLogo : options.platformLogo;
  });
  const findTenantBrandLogoForBinding = mock(async () => {
    calls.push("tenant-logo");
    if (options.tenantLogoFailure) throw databaseFailure;
    return options.tenantLogo === undefined ? tenantLogo : options.tenantLogo;
  });
  const getTenantSummary = mock(async () => {
    calls.push("entitlement");
    if (options.entitlementFailure) throw databaseFailure;
    const current = options.entitlement === undefined
      ? entitlement
      : options.entitlement;
    if (!current) return null;
    return {
      entitlement: {
        id: current.id,
        tenant_id: current.tenant_id,
        code: current.entitlement_code,
        status: current.status,
        starts_at: current.starts_at,
        expires_at: current.expires_at,
        source_type: current.source_type,
        source_id: current.source_id,
        suspended_at: current.suspended_at,
        suspend_reason: current.suspend_reason,
        version: current.version,
        updated_at: current.updated_at,
        ...options.summaryEntitlementOverrides,
      },
      isActive: options.summaryIsActive ?? true,
      tenantId: options.summaryTenantId ?? TENANT_ID,
      tenantStatus: options.summaryTenantStatus ?? "active",
    };
  });
  const getRequiredAuthContext = mock(async () => {
    calls.push("auth-context"); if (options.authFailure) throw databaseFailure;
    return options.authContext ?? authContext;
  });
  const service = new EffectiveBrandingService({
    brandingRepository: {
      findPlatformProfile,
      findTenantProfile,
      findPlatformBrandLogoForBinding,
      findTenantBrandLogoForBinding,
    },
    tenantEntitlementsService: { getTenantSummary },
    authorizationService: { getRequiredAuthContext },
    fallbackLogoUrl: options.fallbackLogoUrl === undefined
      ? FALLBACK_LOGO_URL
      : options.fallbackLogoUrl,
    runtimeEnvironment: options.runtimeEnvironment,
    logoUrlResolver: options.logoUrlResolver ?? ((file) => file.public_url),
  });
  return {
    service,
    calls,
    findPlatformProfile,
    findTenantProfile,
    findPlatformBrandLogoForBinding,
    findTenantBrandLogoForBinding,
    getTenantSummary,
    getRequiredAuthContext,
  };
}
const expectedPlatform = {
  source: "platform",
  tenant_id: null,
  display_name: "字节跳动",
  logo_url: platformLogo.public_url ?? "",
  support_text: "字节跳动",
  version: 4,
  updated_at: platformProfile.published_at ?? "",
} satisfies EffectiveBranding;
const expectedTenant = {
  source: "tenant",
  tenant_id: TENANT_ID,
  display_name: "晴天装饰",
  logo_url: tenantLogo.public_url ?? "",
  support_text: "晴天装饰",
  version: 6,
  updated_at: tenantProfile.published_at ?? "",
} satisfies EffectiveBranding;
test("effective branding resolves the stored COS URL before returning it", async () => {
  const signedLogoUrl = "https://cos.example.com/logo.png?q-signature=signed";
  const current = fixture({
    logoUrlResolver: (file) =>
      file.object_key === tenantLogo.object_key
        ? signedLogoUrl
        : file.public_url,
  });

  await expect(current.service.resolveForTenant(TENANT_ID, NOW))
    .resolves.toMatchObject({
      source: "tenant",
      tenant_id: TENANT_ID,
      logo_url: signedLogoUrl,
    });
});
describe("EffectiveBrandingService request context", () => {
  test("unsupported, visitor, and malformed token identities return platform", async () => {
    for (const user of [
      undefined,
      { token_type: "auth", tenant_id: TENANT_ID },
      {
        token_type: "visitor_session", openid: "openid",
        visitor_id: "visitor", sub: USER_ID, tenant_id: TENANT_ID,
      },
      {
        token_type: "h5_marketing", sub: USER_ID,
        tenant_id: TENANT_ID, customer_id: CUSTOMER_ID,
      },
      {
        token_type: "platform_partner", sub: USER_ID,
        tenant_id: TENANT_ID,
      },
      { token_type: "unknown", sub: USER_ID, tenant_id: TENANT_ID },
    ]) {
      const current = fixture();
      await expect(current.service.resolveForRequest(user as JwtPayload, NOW))
        .resolves.toEqual(expectedPlatform);
      expect(current.getRequiredAuthContext).not.toHaveBeenCalled();
      expect(current.getTenantSummary).not.toHaveBeenCalled();
    }
  });
  test("mixed customer and employee claims fail closed", async () => {
    const current = fixture();
    await expect(current.service.resolveForRequest({
      sub: USER_ID, token_type: "auth", tenant_id: TENANT_ID,
      customer_id: CUSTOMER_ID, employee_id: authContext.employeeId,
    }, NOW))
      .resolves.toEqual(expectedPlatform);
    expect(current.getRequiredAuthContext).not.toHaveBeenCalled();
    expect(current.getTenantSummary).not.toHaveBeenCalled();
  });
  test("pure customer uses the plugin-verified canonical tenant without AuthContext", async () => {
    const current = fixture({ authFailure: true });
    await expect(current.service.resolveForRequest({
      sub: USER_ID, token_type: "auth",
      tenant_id: TENANT_ID, customer_id: CUSTOMER_ID,
    }, NOW)).resolves.toEqual(expectedTenant);
    expect(current.getRequiredAuthContext).not.toHaveBeenCalled();
    expect(current.getTenantSummary).toHaveBeenCalledWith(TENANT_ID, NOW);
  });
  test("pure customer rejects non-canonical tenant claims", async () => {
    for (const tenant_id of [
      ` ${TENANT_ID}`, "00000000-0000-4000-8000-00000000000A",
      "tenant-1", null,
    ]) {
      const current = fixture();
      await expect(current.service.resolveForRequest({
        sub: USER_ID, token_type: "auth", tenant_id,
        customer_id: CUSTOMER_ID,
      }, NOW)).resolves.toEqual(expectedPlatform);
      expect(current.getRequiredAuthContext).not.toHaveBeenCalled();
      expect(current.getTenantSummary).not.toHaveBeenCalled();
    }
  });
  test("employee requires an exact server AuthContext binding", async () => {
    const valid = fixture();
    await expect(valid.service.resolveForRequest({
      sub: USER_ID, token_type: "auth", tenant_id: CLAIM_TENANT_ID,
      employee_id: authContext.employeeId,
    }, NOW)).resolves.toEqual(expectedTenant);
    expect(valid.getRequiredAuthContext).toHaveBeenCalledWith(
      USER_ID, { tenantServiceAccess: "read" },
    );
    for (const context of [
      { ...authContext, authUserId: CLAIM_TENANT_ID },
      { ...authContext, employeeId: CLAIM_TENANT_ID },
    ]) {
      const current = fixture({ authContext: context });
      await expect(current.service.resolveForRequest({
        sub: USER_ID, token_type: "auth",
        employee_id: authContext.employeeId,
      }, NOW)).resolves.toEqual(expectedPlatform);
      expect(current.getTenantSummary).not.toHaveBeenCalled();
    }
  });
  test("resolves platform before employee auth and entitlement gates", async () => {
    const current = fixture();
    await current.service.resolveForRequest({
      sub: USER_ID, token_type: "auth", tenant_id: CLAIM_TENANT_ID,
      employee_id: authContext.employeeId,
    }, NOW);
    expect(current.calls.slice(0, 3))
      .toEqual(["platform-profile", "platform-logo", "auth-context"]);
    expect(current.calls.indexOf("auth-context"))
      .toBeLessThan(current.calls.indexOf("entitlement"));
  });
  test("legacy tokens use AuthContext while platform admin remains platform", async () => {
    const platformAdminContext = {
      ...authContext,
      tenantId: null,
      tenantName: null,
      tenantSlug: null,
      tenantStatus: null,
      isPlatformAdmin: true,
    };
    for (const token_type of ["auth", undefined] as const) {
      const current = fixture();
      await expect(current.service.resolveForRequest({
        sub: USER_ID, token_type,
      }, NOW)).resolves.toEqual(expectedTenant);
      expect(current.getRequiredAuthContext).toHaveBeenCalled();
    }
    for (const options of [{ authFailure: true }, { authContext: platformAdminContext }]) {
      const current = fixture(options);
      await expect(current.service.resolveForRequest({
        sub: USER_ID, token_type: "auth",
      }, NOW)).resolves.toEqual(expectedPlatform);
    }
  });
});
describe("EffectiveBrandingService tenant eligibility", () => {
  test("missing, inactive, or unreadable summaries return platform without a duplicate tenant lookup", async () => {
    for (const options of [
      { entitlement: null },
      { summaryTenantStatus: "suspended", summaryIsActive: false },
      { entitlementFailure: true },
    ]) {
      const current = fixture(options);
      await expect(current.service.resolveForTenant(TENANT_ID, NOW))
        .resolves.toEqual(expectedPlatform);
      expect(current.findTenantProfile).not.toHaveBeenCalled();
    }
  });
  test("missing, failed, suspended, expired, revoked, not-started, and boundary-expired entitlements return platform", async () => {
    const cases: FixtureOptions[] = [
      { entitlement: null },
      { entitlementFailure: true },
      { entitlement: { ...entitlement, status: "suspended" } },
      { entitlement: { ...entitlement, status: "expired" } },
      { entitlement: { ...entitlement, status: "revoked" } },
      {
        entitlement: { ...entitlement, starts_at: "2026-07-27T10:00:00.001Z" },
      },
      {
        entitlement: { ...entitlement, expires_at: NOW.toISOString() },
      },
      { summaryIsActive: false },
    ];
    for (const options of cases) {
      const current = fixture(options);
      await expect(current.service.resolveForTenant(TENANT_ID, NOW))
        .resolves.toEqual(expectedPlatform);
      expect(current.findTenantProfile).not.toHaveBeenCalled();
    }
  });
  test("malformed entitlement identity, version, and dates fail closed", async () => {
    for (const summaryEntitlementOverrides of [
      { tenant_id: CLAIM_TENANT_ID }, { code: "other_entitlement" }, { version: 0 },
      { version: Number.MAX_SAFE_INTEGER + 1 },
      { starts_at: "not-a-date" }, { expires_at: "not-a-date" },
    ]) {
      const current = fixture({ summaryEntitlementOverrides });
      await expect(current.service.resolveForTenant(TENANT_ID, NOW))
        .resolves.toEqual(expectedPlatform);
      expect(current.findTenantProfile).not.toHaveBeenCalled();
    }
    for (const options of [
      { summaryTenantId: CLAIM_TENANT_ID },
      { summaryTenantStatus: "" },
    ]) {
      const current = fixture(options);
      await expect(current.service.resolveForTenant(TENANT_ID, NOW))
        .resolves.toEqual(expectedPlatform);
      expect(current.findTenantProfile).not.toHaveBeenCalled();
    }
  });
  test("invalid or incomplete tenant published snapshots return platform", async () => {
    const profiles: Array<BrandProfileRecord | null> = [
      null,
      { ...tenantProfile, status: "draft" },
      { ...tenantProfile, status: "disabled" },
      { ...tenantProfile, scope: "platform", tenant_id: null },
      { ...tenantProfile, tenant_id: "00000000-0000-4000-8000-000000000099" },
      { ...tenantProfile, published_display_name: null },
      { ...tenantProfile, published_display_name: " " },
      { ...tenantProfile, published_logo_file_id: null },
      { ...tenantProfile, published_version: null },
      { ...tenantProfile, version: 5, published_version: 6 },
      { ...tenantProfile, published_at: null },
    ];
    for (const profile of profiles) {
      const result = await fixture({ tenantProfile: profile })
        .service.resolveForTenant(TENANT_ID, NOW);
      expect(result).toEqual(expectedPlatform);
    }
    await expect(fixture({ tenantProfileFailure: true })
      .service.resolveForTenant(TENANT_ID, NOW)).resolves.toEqual(expectedPlatform);
  });
  test("missing, wrong-scope, invalid-property, invalid-URL, and failed tenant logo reads return platform", async () => {
    const logos: Array<BrandingPlatformFileObjectRecord | null> = [
      null,
      { ...tenantLogo, tenant_id: "00000000-0000-4000-8000-000000000099" },
      { ...tenantLogo, scene: "avatar" },
      { ...tenantLogo, status: "pending" },
      { ...tenantLogo, visibility: "private" },
      { ...tenantLogo, deleted_at: NOW.toISOString() },
      { ...tenantLogo, mime_type: "image/gif" },
      { ...tenantLogo, size_bytes: 0 },
      { ...tenantLogo, size_bytes: 2 * 1024 * 1024 + 1 },
      { ...tenantLogo, width: 127 },
      { ...tenantLogo, height: 127 },
      { ...tenantLogo, width: 256, height: 128 },
      { ...tenantLogo, public_url: null },
      { ...tenantLogo, public_url: "file:///tmp/logo.png" },
    ];
    for (const logo of logos) {
      const result = await fixture({ tenantLogo: logo })
        .service.resolveForTenant(TENANT_ID, NOW);
      expect(result).toEqual(expectedPlatform);
    }
    await expect(fixture({ tenantLogoFailure: true })
      .service.resolveForTenant(TENANT_ID, NOW)).resolves.toEqual(expectedPlatform);
  });
  test("returns only the tenant published snapshot when every gate is valid", async () => {
    const current = fixture();
    const result = await current.service.resolveForTenant(TENANT_ID, NOW);
    expect(result).toEqual(expectedTenant);
    expect(current.findTenantBrandLogoForBinding)
      .toHaveBeenCalledWith(TENANT_LOGO_ID, TENANT_ID);
    expect(Object.keys(result).sort()).toEqual([
      "display_name",
      "logo_url",
      "source",
      "support_text",
      "tenant_id",
      "updated_at",
      "version",
    ]);
    for (const internal of [
      "profile",
      "file",
      "entitlement",
      "source_id",
      "actor",
      "order",
      "reason",
      "published_logo_file_id",
    ]) {
      expect(internal in result).toBe(false);
    }
  });
});
