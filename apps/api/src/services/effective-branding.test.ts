import { beforeAll, describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import type { BrandProfileRecord, BrandingTenantRecord } from "@/repositories/branding";
import type { BrandingPlatformFileObjectRecord } from "@/repositories/platform-file-objects";
import type { TenantEntitlementRecord } from "@/repositories/tenant-entitlements";
import type { AuthContext } from "@/services/authorization";
import type { EffectiveBranding } from "@/services/effective-branding";
import type { JwtPayload } from "@/utils/jwt";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
let EffectiveBrandingService: typeof import("./effective-branding").EffectiveBrandingService;
beforeAll(async () => {
  ({ EffectiveBrandingService } = await import("./effective-branding"));
});
const NOW = new Date("2026-07-27T10:00:00.000Z");
const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const PLATFORM_LOGO_ID = "00000000-0000-4000-8000-000000000010";
const TENANT_LOGO_ID = "00000000-0000-4000-8000-000000000011";
const FALLBACK_LOGO_URL = "https://fallback.example.com/logo.png";
const databaseFailure = { code: "DB_ERROR", message: "sensitive db details" };
const platformProfile = {
  id: "00000000-0000-4000-8000-000000000020",
  scope: "platform",
  tenant_id: null,
  display_name: "未发布的平台草稿",
  logo_file_id: "00000000-0000-4000-8000-000000000099",
  published_display_name: "字节跳动",
  published_logo_file_id: PLATFORM_LOGO_ID,
  status: "published",
  version: 5,
  published_version: 4,
  published_at: "2026-07-27T09:00:00.000Z",
  updated_by_employee_id: USER_ID,
  created_at: "2026-07-27T08:00:00.000Z",
  updated_at: "2026-07-27T09:30:00.000Z",
} satisfies BrandProfileRecord;
const tenantProfile = {
  ...platformProfile,
  id: "00000000-0000-4000-8000-000000000021",
  scope: "tenant",
  tenant_id: TENANT_ID,
  display_name: "租户未发布草稿",
  logo_file_id: "00000000-0000-4000-8000-000000000098",
  published_display_name: "晴天装饰",
  published_logo_file_id: TENANT_LOGO_ID,
  version: 7,
  published_version: 6,
  published_at: "2026-07-27T09:15:00.000Z",
  updated_at: "2026-07-27T09:45:00.000Z",
} satisfies BrandProfileRecord;
function brandLogo(
  id: string,
  tenantId: string | null,
): BrandingPlatformFileObjectRecord {
  return {
    id,
    tenant_id: tenantId,
    owner_type: tenantId ? "employee" : "platform",
    owner_id: USER_ID,
    scene: "brand_logo",
    provider: "tencent_cos",
    bucket: "branding",
    region: "ap-guangzhou",
    object_key: `${tenantId ?? "platform"}/logo.png`,
    mime_type: "image/png",
    size_bytes: 1024,
    width: 256,
    height: 256,
    checksum: "sha256",
    visibility: "public",
    public_url: `https://cdn.example.com/${id}.png`,
    status: "active",
    deleted_at: null,
  };
}
const platformLogo = brandLogo(PLATFORM_LOGO_ID, null);
const tenantLogo = brandLogo(TENANT_LOGO_ID, TENANT_ID);
const tenant = {
  id: TENANT_ID,
  name: "晴天装饰",
  status: "active",
} satisfies BrandingTenantRecord;
const entitlement = {
  id: "00000000-0000-4000-8000-000000000030",
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
  updated_by_employee_id: USER_ID,
  created_at: "2026-07-27T09:00:00.000Z",
  updated_at: "2026-07-27T09:00:00.000Z",
} satisfies TenantEntitlementRecord;
const authContext = {
  authUserId: USER_ID,
  employeeId: "00000000-0000-4000-8000-000000000003",
  tenantId: TENANT_ID,
  tenantName: tenant.name,
  tenantSlug: "sunny",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "租户员工",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["employee"],
  roles: [],
  permissions: [],
} satisfies AuthContext;
type FixtureOptions = {
  platformProfile?: BrandProfileRecord | null;
  tenantProfile?: BrandProfileRecord | null;
  platformLogo?: BrandingPlatformFileObjectRecord | null;
  tenantLogo?: BrandingPlatformFileObjectRecord | null;
  tenant?: BrandingTenantRecord | null;
  entitlement?: TenantEntitlementRecord | null;
  summaryIsActive?: boolean;
  platformProfileFailure?: boolean;
  tenantFailure?: boolean;
  entitlementFailure?: boolean;
  tenantProfileFailure?: boolean;
  platformLogoFailure?: boolean;
  tenantLogoFailure?: boolean;
  authFailure?: boolean;
  authContext?: AuthContext;
  fallbackLogoUrl?: string | null;
};
function fixture(options: FixtureOptions = {}) {
  const findPlatformProfile = mock(async () => {
    if (options.platformProfileFailure) throw databaseFailure;
    return options.platformProfile === undefined
      ? platformProfile
      : options.platformProfile;
  });
  const findTenantProfile = mock(async () => {
    if (options.tenantProfileFailure) throw databaseFailure;
    return options.tenantProfile === undefined ? tenantProfile : options.tenantProfile;
  });
  const findTenant = mock(async () => {
    if (options.tenantFailure) throw databaseFailure;
    return options.tenant === undefined ? tenant : options.tenant;
  });
  const findPlatformBrandLogoForBinding = mock(async () => {
    if (options.platformLogoFailure) throw databaseFailure;
    return options.platformLogo === undefined ? platformLogo : options.platformLogo;
  });
  const findTenantBrandLogoForBinding = mock(async () => {
    if (options.tenantLogoFailure) throw databaseFailure;
    return options.tenantLogo === undefined ? tenantLogo : options.tenantLogo;
  });
  const getTenantSummary = mock(async () => {
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
      },
      isActive: options.summaryIsActive ?? true,
    };
  });
  const getRequiredAuthContext = mock(async () => {
    if (options.authFailure) throw databaseFailure;
    return options.authContext ?? authContext;
  });
  const service = new EffectiveBrandingService({
    brandingRepository: {
      findPlatformProfile,
      findTenantProfile,
      findTenant,
      findPlatformBrandLogoForBinding,
      findTenantBrandLogoForBinding,
    },
    tenantEntitlementsService: { getTenantSummary },
    authorizationService: { getRequiredAuthContext },
    fallbackLogoUrl: options.fallbackLogoUrl === undefined
      ? FALLBACK_LOGO_URL
      : options.fallbackLogoUrl,
  });
  return {
    service,
    findPlatformProfile,
    findTenantProfile,
    findTenant,
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
  support_text: "字节跳动提供技术支持",
  version: 4,
  updated_at: platformProfile.published_at ?? "",
} satisfies EffectiveBranding;
const expectedTenant = {
  source: "tenant",
  tenant_id: TENANT_ID,
  display_name: "晴天装饰",
  logo_url: tenantLogo.public_url ?? "",
  support_text: "晴天装饰提供技术支持",
  version: 6,
  updated_at: tenantProfile.published_at ?? "",
} satisfies EffectiveBranding;
describe("EffectiveBrandingService platform fallback", () => {
  test("uses only a valid published platform snapshot and ignores newer draft fields", async () => {
    const current = fixture();
    await expect(current.service.resolvePlatform()).resolves.toEqual(expectedPlatform);
    expect(current.findPlatformBrandLogoForBinding)
      .toHaveBeenCalledWith(PLATFORM_LOGO_ID);
  });
  test("returns a stable non-empty code fallback when the platform chain and configured URL fail", async () => {
    const current = fixture({
      platformProfileFailure: true,
      fallbackLogoUrl: "javascript:alert(1)",
    });
    const first = await current.service.resolvePlatform();
    const second = await current.service.resolvePlatform();
    expect(first).toEqual(second);
    expect(first).toEqual({
      source: "platform",
      tenant_id: null,
      display_name: "字节跳动",
      logo_url: expect.stringMatching(/^data:image\/png;base64,/),
      support_text: "字节跳动提供技术支持",
      version: 0,
      updated_at: "1970-01-01T00:00:00.000Z",
    });
    expect(Object.keys(first).sort()).toEqual([
      "display_name",
      "logo_url",
      "source",
      "support_text",
      "tenant_id",
      "updated_at",
      "version",
    ]);
    const png = Buffer.from(
      first.logo_url.slice("data:image/png;base64,".length),
      "base64",
    );
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(png.readUInt32BE(16)).toBe(256);
    expect(png.readUInt32BE(20)).toBe(256);
    expect(png.byteLength).toBe(10_152);
    expect(createHash("sha256").update(png).digest("hex")).toBe(
      "49e804acca9d15e15577cefd8b839dc92b86dfd35313a030b5f17888ed6fc932",
    );
  });
  test("rejects non-canonical fallback URLs", async () => {
    await expect(fixture({
      platformProfile: null, fallbackLogoUrl: "https:cdn.example.com/logo.png",
    }).service.resolvePlatform()).resolves.toMatchObject({
      logo_url: expect.stringMatching(/^data:image\/png;base64,/),
    });
  });
  test("fails closed for incomplete platform profiles, missing files, invalid files, and DB errors", async () => {
    const invalidProfiles: Array<BrandProfileRecord | null> = [
      null,
      { ...platformProfile, status: "draft" },
      { ...platformProfile, scope: "tenant", tenant_id: TENANT_ID },
      { ...platformProfile, published_display_name: null },
      { ...platformProfile, published_logo_file_id: null },
      { ...platformProfile, published_version: null },
      { ...platformProfile, version: 3, published_version: 4 },
      { ...platformProfile, published_at: null },
    ];
    for (const profile of invalidProfiles) {
      const result = await fixture({ platformProfile: profile }).service.resolvePlatform();
      expect(result.logo_url).toBe(FALLBACK_LOGO_URL);
      expect(result.version).toBe(0);
    }
    for (const options of [
      { platformLogo: null },
      { platformLogo: { ...platformLogo, status: "deleted" } },
      { platformLogoFailure: true },
    ]) {
      const result = await fixture(options).service.resolvePlatform();
      expect(result.logo_url).toBe(FALLBACK_LOGO_URL);
      expect(result.version).toBe(0);
    }
  });
});
describe("EffectiveBrandingService request context", () => {
  test("no token and visitor session use the platform without querying tenant state", async () => {
    for (const user of [
      undefined,
      {
        token_type: "visitor_session", openid: "openid",
        visitor_id: "visitor", tenant_id: TENANT_ID,
      } satisfies JwtPayload,
    ]) {
      const current = fixture();
      await expect(current.service.resolveForRequest(user, NOW))
        .resolves.toEqual(expectedPlatform);
      expect(current.findTenant).not.toHaveBeenCalled();
      expect(current.getRequiredAuthContext).not.toHaveBeenCalled();
    }
  });
  test("a tenant claim without a valid subject cannot select a tenant brand", async () => {
    const current = fixture();
    const invalidUser = { token_type: "auth", tenant_id: TENANT_ID } as const;
    await expect(current.service.resolveForRequest(invalidUser, NOW))
      .resolves.toEqual(expectedPlatform);
    expect(current.findTenant).not.toHaveBeenCalled();
  });
  test("employee and customer auth tokens use their verified tenant directly", async () => {
    for (const user of [
      {
        sub: USER_ID, token_type: "auth", tenant_id: TENANT_ID,
        employee_id: authContext.employeeId,
      },
      {
        sub: USER_ID, token_type: "auth", tenant_id: TENANT_ID,
        customer_id: "00000000-0000-4000-8000-000000000004",
      },
    ] satisfies JwtPayload[]) {
      const current = fixture();
      await expect(current.service.resolveForRequest(user, NOW))
        .resolves.toEqual(expectedTenant);
      expect(current.getRequiredAuthContext).not.toHaveBeenCalled();
    }
  });
  test("loads server auth context for a valid subject without a tenant claim", async () => {
    const current = fixture();
    await expect(current.service.resolveForRequest({
      sub: USER_ID,
      token_type: "auth",
    }, NOW)).resolves.toEqual(expectedTenant);
    expect(current.getRequiredAuthContext).toHaveBeenCalledWith(
      USER_ID,
      { allowedWhenBillingLocked: true },
    );
  });
  test("auth lookup failure and platform-admin context fail closed to platform", async () => {
    const platformAdminContext = {
      ...authContext,
      tenantId: null,
      tenantName: null,
      tenantSlug: null,
      tenantStatus: null,
      isPlatformAdmin: true,
    };
    for (const options of [
      { authFailure: true },
      { authContext: platformAdminContext },
    ]) {
      const current = fixture(options);
      await expect(current.service.resolveForRequest({
        sub: USER_ID,
        token_type: "auth",
      }, NOW)).resolves.toEqual(expectedPlatform);
      expect(current.findTenant).not.toHaveBeenCalled();
    }
  });
});
describe("EffectiveBrandingService tenant eligibility", () => {
  test("missing, inactive, or unreadable tenants return platform and short-circuit", async () => {
    for (const options of [
      { tenant: null },
      { tenant: { ...tenant, status: "suspended" } },
      { tenantFailure: true },
    ]) {
      const current = fixture(options);
      await expect(current.service.resolveForTenant(TENANT_ID, NOW))
        .resolves.toEqual(expectedPlatform);
      expect(current.getTenantSummary).not.toHaveBeenCalled();
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
