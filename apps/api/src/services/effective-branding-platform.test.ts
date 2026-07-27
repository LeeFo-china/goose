import { beforeAll, describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import type { BrandProfileRecord } from "@/repositories/branding";
import type { BrandingPlatformFileObjectRecord } from "@/repositories/platform-file-objects";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let EffectiveBrandingService:
  typeof import("./effective-branding").EffectiveBrandingService;
beforeAll(async () =>
  ({ EffectiveBrandingService } = await import("./effective-branding")));

const USER_ID = "00000000-0000-4000-8000-000000000002";
const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const PLATFORM_LOGO_ID = "00000000-0000-4000-8000-000000000010";
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
const platformLogo = {
  id: PLATFORM_LOGO_ID, tenant_id: null, owner_type: "platform",
  owner_id: USER_ID, scene: "brand_logo", provider: "tencent_cos",
  bucket: "branding", region: "ap-guangzhou", object_key: "platform/logo.png",
  mime_type: "image/png", size_bytes: 1024, width: 256, height: 256,
  checksum: "sha256", visibility: "public",
  public_url: `https://cdn.example.com/${PLATFORM_LOGO_ID}.png`,
  status: "active", deleted_at: null,
} satisfies BrandingPlatformFileObjectRecord;

type FixtureOptions = {
  platformProfile?: BrandProfileRecord | null;
  platformLogo?: BrandingPlatformFileObjectRecord | null;
  platformProfileFailure?: boolean;
  platformLogoFailure?: boolean;
  fallbackLogoUrl?: string | null;
  runtimeEnvironment?: string;
};

function fixture(options: FixtureOptions = {}) {
  const findPlatformProfile = mock(async () => {
    if (options.platformProfileFailure) throw databaseFailure;
    return options.platformProfile === undefined
      ? platformProfile
      : options.platformProfile;
  });
  const findPlatformBrandLogoForBinding = mock(async () => {
    if (options.platformLogoFailure) throw databaseFailure;
    return options.platformLogo === undefined
      ? platformLogo
      : options.platformLogo;
  });
  const service = new EffectiveBrandingService({
    brandingRepository: {
      findPlatformProfile,
      findPlatformBrandLogoForBinding,
      findTenantProfile: mock(async () => null),
      findTenantBrandLogoForBinding: mock(async () => null),
    },
    tenantEntitlementsService: {
      getTenantSummary: mock(async () => null),
    },
    authorizationService: {
      getRequiredAuthContext: mock(async () => {
        throw databaseFailure;
      }),
    },
    fallbackLogoUrl: options.fallbackLogoUrl === undefined
      ? FALLBACK_LOGO_URL
      : options.fallbackLogoUrl,
    runtimeEnvironment: options.runtimeEnvironment,
    logoUrlResolver: (file) => file.public_url,
  });
  return { service, findPlatformBrandLogoForBinding };
}

describe("EffectiveBrandingService platform fallback", () => {
  test("uses only a valid published platform snapshot and ignores newer draft fields", async () => {
    const current = fixture();
    await expect(current.service.resolvePlatform()).resolves.toMatchObject({
      source: "platform",
      display_name: "字节跳动",
      logo_url: platformLogo.public_url,
      version: 4,
    });
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
      "display_name", "logo_url", "source", "support_text",
      "tenant_id", "updated_at", "version",
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
      platformProfile: null,
      fallbackLogoUrl: "https:cdn.example.com/logo.png",
    }).service.resolvePlatform()).resolves.toMatchObject({
      logo_url: expect.stringMatching(/^data:image\/png;base64,/),
    });
  });

  test("bounds fallback URLs and requires HTTPS in production", async () => {
    for (const fallbackLogoUrl of [
      `https://cdn.example.com/${"x".repeat(2_049)}`,
      "http://cdn.example.com/logo.png",
    ]) {
      const result = await fixture({
        platformProfile: null, fallbackLogoUrl,
        runtimeEnvironment: "production",
      }).service.resolvePlatform();
      expect(result.logo_url).toStartWith("data:image/png;base64,");
    }
    for (const [runtimeEnvironment, fallbackLogoUrl] of [
      ["production", "https://cdn.example.com/logo.png"],
      ["development", "http://127.0.0.1:3000/logo.png"],
      ["test", "http://127.0.0.1:3000/logo.png"],
    ] as const) {
      const result = await fixture({
        platformProfile: null, fallbackLogoUrl, runtimeEnvironment,
      }).service.resolvePlatform();
      expect(result.logo_url).toBe(fallbackLogoUrl);
    }
  });

  test("fails closed for incomplete profiles and invalid logo reads", async () => {
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
      const result = await fixture({ platformProfile: profile }).service
        .resolvePlatform();
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
