import { beforeAll, describe, expect, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";
import type { BrandProfileRecord } from "@/services/branding-contracts";

import {
  EMPLOYEE_ID,
  FILE_ID,
  NOW,
  OTHER_TENANT_ID,
  TENANT_ID,
  createFixture,
  entitlement,
  platformAuthContext,
  platformFile,
  platformProfile,
  tenantAuthContext,
  tenantFile,
  tenantProfile,
} from "./brand-profiles.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let BrandProfilesService: new (dependencies: never) => ReturnType<
  typeof createFixture
>["service"];

beforeAll(async () => {
  ({ BrandProfilesService } = await import("./brand-profiles"));
});

describe("BrandProfilesService platform access and read", () => {
  test.each([
    ["tenant identity", { ...platformAuthContext, isPlatformAdmin: false }],
    ["tenant-scoped platform flag", {
      ...platformAuthContext,
      tenantId: TENANT_ID,
    }],
    ["missing employee", { ...platformAuthContext, employeeId: null }],
    ["missing permission", { ...platformAuthContext, permissions: [] }],
  ] satisfies Array<[string, AuthContext]>)(
    "rejects %s before querying the platform profile",
    async (_name, authContext) => {
      const fixture = createFixture(BrandProfilesService);

      await expect(fixture.service.getPlatform(authContext))
        .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
      expect(fixture.findPlatformProfile).not.toHaveBeenCalled();
    },
  );

  test("returns an explicit profile with a scope-validated public URL", async () => {
    const fixture = createFixture(BrandProfilesService);

    await expect(fixture.service.getPlatform(platformAuthContext))
      .resolves.toEqual({
        profile: {
          display_name: platformProfile.display_name,
          logo_file_id: FILE_ID,
          logo_url: platformFile.public_url,
          status: "published",
          version: 4,
          published_version: 3,
          has_unpublished_changes: true,
          published_at: platformProfile.published_at,
          updated_at: platformProfile.updated_at,
        },
      });
    expect(fixture.findBrandingFileForPlatform).toHaveBeenCalledWith(FILE_ID);
  });

  test("keeps null profile explicit and does not query a file", async () => {
    const fixture = createFixture(BrandProfilesService, {
      platformProfile: null,
    });

    await expect(fixture.service.getPlatform(platformAuthContext))
      .resolves.toEqual({ profile: null });
    expect(fixture.findBrandingFileForPlatform).not.toHaveBeenCalled();
  });

  test("returns null logo URL for an invalid management-view file", async () => {
    const fixture = createFixture(BrandProfilesService, {
      platformFile: { ...platformFile, width: 64 },
    });

    await expect(fixture.service.getPlatform(platformAuthContext))
      .resolves.toMatchObject({
        profile: { logo_file_id: FILE_ID, logo_url: null },
      });
  });

  test("keeps the file ID but hides an invalid public URL", async () => {
    const fixture = createFixture(BrandProfilesService, {
      platformFile: {
        ...platformFile,
        public_url: "javascript:alert(1)",
      },
    });

    await expect(fixture.service.getPlatform(platformAuthContext))
      .resolves.toMatchObject({
        profile: { logo_file_id: FILE_ID, logo_url: null },
      });
  });
});

describe("BrandProfilesService tenant read", () => {
  test.each([
    ["customer context", { ...tenantAuthContext, employeeId: null }],
    ["platform identity", { ...tenantAuthContext, isPlatformAdmin: true }],
    ["missing tenant", { ...tenantAuthContext, tenantId: null }],
    ["missing read permission", {
      ...tenantAuthContext,
      permissions: tenantAuthContext.permissions.filter(
        ({ code }) => code !== "brand.settings.read",
      ),
    }],
  ] satisfies Array<[string, AuthContext]>)(
    "rejects %s before reading profile or entitlement",
    async (_name, authContext) => {
      const fixture = createFixture(BrandProfilesService);

      await expect(fixture.service.getTenant(authContext))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(fixture.findTenantProfile).not.toHaveBeenCalled();
      expect(fixture.getTenantSummary).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["missing", null, false],
    ["suspended", "suspended", false],
    ["expired", "expired", false],
    ["revoked", "revoked", false],
    ["active", "active", true],
  ] as const)(
    "returns %s entitlement without turning read into an update error",
    async (_name, status, isActive) => {
      const summary = status === null
        ? null
        : {
          entitlement: {
            id: entitlement.id,
            tenant_id: TENANT_ID,
            code: "custom_support_branding" as const,
            status,
            starts_at: entitlement.starts_at,
            expires_at: entitlement.expires_at,
            source_type: entitlement.source_type,
            source_id: null,
            suspended_at: status === "suspended" ? NOW.toISOString() : null,
            suspend_reason: status === "suspended" ? "待核验" : null,
            version: 1,
            updated_at: entitlement.updated_at,
          },
          isActive,
        };
      const fixture = createFixture(BrandProfilesService, {
        entitlementSummary: summary,
      });

      const result = await fixture.service.getTenant(tenantAuthContext);

      expect(result).toMatchObject({
        profile: {
          display_name: tenantProfile.display_name,
          logo_url: tenantFile.public_url,
        },
        entitlement: summary?.entitlement ?? null,
        can_customize: isActive,
      });
      expect(fixture.getTenantSummary).toHaveBeenCalledWith(TENANT_ID, NOW);
      expect(fixture.assertCanCustomize).not.toHaveBeenCalled();
    },
  );

  test("active entitlement cannot customize without update permission", async () => {
    const fixture = createFixture(BrandProfilesService);
    const readOnlyContext = {
      ...tenantAuthContext,
      permissions: [{ code: "brand.settings.read", scope: "all" as const }],
    };

    await expect(fixture.service.getTenant(readOnlyContext))
      .resolves.toMatchObject({
        entitlement: { status: "active" },
        can_customize: false,
      });
  });

  test("keeps null profile and entitlement explicit", async () => {
    const fixture = createFixture(BrandProfilesService, {
      tenantProfile: null,
      entitlementSummary: null,
    });

    await expect(fixture.service.getTenant(tenantAuthContext))
      .resolves.toEqual({
        profile: null,
        entitlement: null,
        can_customize: false,
      });
    expect(fixture.findBrandingFileForTenant).not.toHaveBeenCalled();
  });
});

describe("BrandProfilesService draft saves", () => {
  test("platform save validates the scoped file and passes exact RPC actor arguments", async () => {
    const saved = {
      ...platformProfile,
      display_name: "新平台品牌",
      version: 5,
    } satisfies BrandProfileRecord;
    const fixture = createFixture(BrandProfilesService, { saveResult: saved });

    await expect(fixture.service.savePlatformDraft(platformAuthContext, {
      display_name: "新平台品牌",
      logo_file_id: FILE_ID,
      version: 4,
    })).resolves.toMatchObject({
      profile: {
        display_name: "新平台品牌",
        logo_url: platformFile.public_url,
        version: 5,
        published_version: 3,
        has_unpublished_changes: true,
      },
    });
    expect(fixture.findBrandingFileForPlatform).toHaveBeenCalledWith(FILE_ID);
    expect(fixture.saveDraft).toHaveBeenCalledWith({
      scope: "platform",
      tenantId: null,
      displayName: "新平台品牌",
      logoFileId: FILE_ID,
      expectedVersion: 4,
      actorEmployeeId: EMPLOYEE_ID,
    });
  });

  test("tenant first save uses version zero and tenant ID only from AuthContext", async () => {
    const first = {
      ...tenantProfile,
      tenant_id: TENANT_ID,
      status: "draft",
      version: 1,
      published_display_name: null,
      published_logo_file_id: null,
      published_version: null,
      published_at: null,
    } satisfies BrandProfileRecord;
    const fixture = createFixture(BrandProfilesService, { saveResult: first });
    const context = {
      ...tenantAuthContext,
      tenantId: TENANT_ID,
      tenantName: OTHER_TENANT_ID,
    };

    await fixture.service.saveTenantDraft(context, {
      display_name: "晴天装饰",
      logo_file_id: FILE_ID,
      version: 0,
    });

    expect(fixture.assertTenantContext).toHaveBeenCalledWith(context);
    expect(fixture.assertCanCustomize).toHaveBeenCalledWith(context, NOW);
    expect(fixture.findBrandingFileForTenant)
      .toHaveBeenCalledWith(FILE_ID, TENANT_ID);
    expect(fixture.saveDraft).toHaveBeenCalledWith({
      scope: "tenant",
      tenantId: TENANT_ID,
      displayName: "晴天装饰",
      logoFileId: FILE_ID,
      expectedVersion: 0,
      actorEmployeeId: EMPLOYEE_ID,
    });
  });

  test("tenant save fails before file lookup when entitlement is unavailable", async () => {
    const denial = Object.assign(new Error("denied"), {
      statusCode: 403,
      code: "BRANDING_ENTITLEMENT_REQUIRED",
    });
    const fixture = createFixture(BrandProfilesService, {
      customizeFailure: denial,
    });

    await expect(fixture.service.saveTenantDraft(tenantAuthContext, {
      display_name: "晴天装饰",
      logo_file_id: FILE_ID,
      version: 4,
    })).rejects.toBe(denial);
    expect(fixture.findBrandingFileForTenant).not.toHaveBeenCalled();
    expect(fixture.saveDraft).not.toHaveBeenCalled();
  });

  test("cross-tenant or missing files are hidden as not found", async () => {
    const fixture = createFixture(BrandProfilesService, { tenantFile: null });

    await expect(fixture.service.saveTenantDraft(tenantAuthContext, {
      display_name: "晴天装饰",
      logo_file_id: FILE_ID,
      version: 4,
    })).rejects.toMatchObject({
      statusCode: 404,
      code: "BRANDING_LOGO_FILE_NOT_FOUND",
    });
    expect(fixture.saveDraft).not.toHaveBeenCalled();
  });

  test("invalid public URLs block save before the draft RPC", async () => {
    const fixture = createFixture(BrandProfilesService, {
      platformFile: { ...platformFile, public_url: "ftp://bad/logo.png" },
    });

    await expect(fixture.service.savePlatformDraft(platformAuthContext, {
      display_name: "平台品牌",
      logo_file_id: FILE_ID,
      version: 4,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "BRANDING_LOGO_FILE_INVALID",
    });
    expect(fixture.saveDraft).not.toHaveBeenCalled();
  });
});

describe("BrandProfilesService publish", () => {
  test("re-reads the draft and file then publishes with no pending changes", async () => {
    const published = {
      ...tenantProfile,
      published_display_name: tenantProfile.display_name,
      published_logo_file_id: tenantProfile.logo_file_id,
      published_version: tenantProfile.version,
      status: "published",
    } satisfies BrandProfileRecord;
    const fixture = createFixture(BrandProfilesService, {
      publishResult: published,
    });

    await expect(fixture.service.publishTenant(tenantAuthContext, {
      version: tenantProfile.version,
    })).resolves.toMatchObject({
      profile: {
        logo_url: tenantFile.public_url,
        published_version: tenantProfile.version,
        has_unpublished_changes: false,
      },
    });
    expect(fixture.findTenantProfile).toHaveBeenCalledWith(TENANT_ID);
    expect(fixture.findBrandingFileForTenant)
      .toHaveBeenCalledWith(FILE_ID, TENANT_ID);
    expect(fixture.publish).toHaveBeenCalledWith({
      scope: "tenant",
      tenantId: TENANT_ID,
      expectedVersion: tenantProfile.version,
      actorEmployeeId: EMPLOYEE_ID,
    });
  });

  test("rejects an incomplete draft before file lookup or RPC", async () => {
    for (
      const profile of [
        null,
        { ...tenantProfile, display_name: "" },
        { ...tenantProfile, logo_file_id: "" },
      ]
    ) {
      const fixture = createFixture(BrandProfilesService, {
        tenantProfile: profile,
      });
      await expect(fixture.service.publishTenant(tenantAuthContext, {
        version: 4,
      })).rejects.toMatchObject({
        statusCode: 400,
        code: "BRANDING_PROFILE_INCOMPLETE",
      });
      expect(fixture.findBrandingFileForTenant).not.toHaveBeenCalled();
      expect(fixture.publish).not.toHaveBeenCalled();
    }
  });

  test("save and publish independently re-read and validate the logo", async () => {
    const fixture = createFixture(BrandProfilesService);

    await fixture.service.savePlatformDraft(platformAuthContext, {
      display_name: "平台品牌",
      logo_file_id: FILE_ID,
      version: 4,
    });
    await fixture.service.publishPlatform(platformAuthContext, { version: 4 });

    expect(fixture.findBrandingFileForPlatform).toHaveBeenCalledTimes(2);
  });

  test("invalid public URLs block publish before the publish RPC", async () => {
    const fixture = createFixture(BrandProfilesService, {
      platformFile: {
        ...platformFile,
        public_url: "https://user:secret@cdn.example.com/logo.png",
      },
    });

    await expect(fixture.service.publishPlatform(platformAuthContext, {
      version: 4,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "BRANDING_LOGO_FILE_INVALID",
    });
    expect(fixture.publish).not.toHaveBeenCalled();
  });
});
