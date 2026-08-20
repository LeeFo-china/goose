import { describe, expect, test } from "bun:test";
import {
  CUSTOM_SUPPORT_BRANDING,
  PLATFORM_FALLBACK_DISPLAY_NAME,
  buildSupportText,
  isEntitlementActive,
  serializeBrandProfile,
  serializeEntitlement,
  serializeTenantBrandingEntitlementSummary,
} from "./branding-contracts";
import type {
  BrandProfileRecord,
  TenantEntitlementRecord,
} from "./branding-contracts";

const serializeNullableProfile = (profile: BrandProfileRecord | null) =>
  serializeBrandProfile(profile, null);
void serializeNullableProfile;

const now = new Date("2026-07-27T10:00:00.000Z");

const entitlement = {
  id: "00000000-0000-4000-8000-000000000020",
  tenant_id: "00000000-0000-4000-8000-000000000001",
  entitlement_code: CUSTOM_SUPPORT_BRANDING,
  status: "active",
  starts_at: "2026-07-27T10:00:00.000Z",
  expires_at: "2027-07-27T10:00:00.000Z",
  source_type: "manual_grant",
  source_id: null,
  suspended_at: null,
  suspend_reason: null,
  version: 1,
  updated_by_employee_id: "00000000-0000-4000-8000-000000000030",
  created_at: "2026-07-27T10:00:00.000Z",
  updated_at: "2026-07-27T10:00:00.000Z",
} satisfies TenantEntitlementRecord;

describe("branding display contracts", () => {
  test("exports stable branding constants and builds support text", () => {
    expect(CUSTOM_SUPPORT_BRANDING).toBe("custom_support_branding");
    expect(PLATFORM_FALLBACK_DISPLAY_NAME).toBe("好店智装云");
    expect(buildSupportText("晴天装饰")).toBe("晴天装饰");
  });
});

describe("isEntitlementActive", () => {
  test("accepts an active tenant entitlement at its inclusive start boundary", () => {
    expect(isEntitlementActive(entitlement, "active", now)).toBe(true);
  });

  test("rejects inactive entitlement statuses", () => {
    for (const status of ["suspended", "expired", "revoked"] as const) {
      expect(isEntitlementActive({ ...entitlement, status }, "active", now))
        .toBe(false);
    }
  });

  test("rejects entitlements that have not started or expire exactly now", () => {
    expect(isEntitlementActive({
      ...entitlement,
      starts_at: "2026-07-27T10:00:00.001Z",
    }, "active", now)).toBe(false);
    expect(isEntitlementActive({
      ...entitlement,
      expires_at: "2026-07-27T10:00:00.000Z",
    }, "active", now)).toBe(false);
    expect(isEntitlementActive({
      ...entitlement,
      expires_at: "2026-07-27T09:59:59.999Z",
    }, "active", now)).toBe(false);
  });

  test("rejects an entitlement when its tenant is not active", () => {
    for (const tenantStatus of ["suspended", "disabled", null]) {
      expect(isEntitlementActive(entitlement, tenantStatus, now)).toBe(false);
    }
  });
});

describe("branding serializers", () => {
  test("serializes the public entitlement fields and renames its code", () => {
    const result = serializeEntitlement(entitlement);

    expect(result).toEqual({
      id: entitlement.id,
      tenant_id: entitlement.tenant_id,
      code: CUSTOM_SUPPORT_BRANDING,
      status: "active",
      starts_at: entitlement.starts_at,
      expires_at: entitlement.expires_at,
      source_type: "manual_grant",
      source_id: null,
      suspended_at: null,
      suspend_reason: null,
      version: 1,
      updated_at: entitlement.updated_at,
    });
    expect("entitlement_code" in result).toBe(false);
    expect("updated_by_employee_id" in result).toBe(false);
    expect("created_at" in result).toBe(false);
  });

  test("serializes only the tenant-branding entitlement summary", () => {
    const result = serializeTenantBrandingEntitlementSummary(
      serializeEntitlement({
        ...entitlement,
        suspended_at: now.toISOString(),
        suspend_reason: "内部核验原因",
      }),
    );

    expect(result).toEqual({
      code: CUSTOM_SUPPORT_BRANDING,
      status: "active",
      expires_at: entitlement.expires_at,
      version: 1,
    });
    expect(Object.keys(result!)).toEqual([
      "code",
      "status",
      "expires_at",
      "version",
    ]);
    expect(serializeTenantBrandingEntitlementSummary(null)).toBeNull();
  });

  test("retains a null profile", () => {
    expect(serializeBrandProfile(null, "https://cdn.example.com/ignored.png"))
      .toBeNull();
  });

  test("serializes a trusted logo URL and unpublished-change state", () => {
    const profile = {
      id: "00000000-0000-4000-8000-000000000040",
      scope: "tenant",
      tenant_id: entitlement.tenant_id,
      display_name: "晴天装饰",
      logo_file_id: "00000000-0000-4000-8000-000000000010",
      published_display_name: "晴天装饰",
      published_logo_file_id: "00000000-0000-4000-8000-000000000010",
      status: "published",
      version: 4,
      published_version: 3,
      published_at: "2026-07-27T09:00:00.000Z",
      updated_by_employee_id: "00000000-0000-4000-8000-000000000030",
      created_at: "2026-07-27T08:00:00.000Z",
      updated_at: "2026-07-27T10:00:00.000Z",
    } satisfies BrandProfileRecord;
    const logoUrl = "https://cdn.example.com/trusted-tenant-logo.png";

    const result = serializeBrandProfile(profile, logoUrl);

    expect(result).toEqual({
      display_name: "晴天装饰",
      logo_file_id: profile.logo_file_id,
      logo_url: logoUrl,
      status: "published",
      version: 4,
      published_version: 3,
      has_unpublished_changes: true,
      published_at: profile.published_at,
      updated_at: profile.updated_at,
    });
    expect("tenant_id" in result!).toBe(false);
    expect("published_logo_file_id" in result!).toBe(false);
    expect("updated_by_employee_id" in result!).toBe(false);
  });

  test("reports no unpublished changes when draft and published versions match", () => {
    const profile = {
      id: "00000000-0000-4000-8000-000000000040",
      scope: "platform",
      tenant_id: null,
      display_name: "好店智装云",
      logo_file_id: "00000000-0000-4000-8000-000000000010",
      published_display_name: "好店智装云",
      published_logo_file_id: "00000000-0000-4000-8000-000000000010",
      status: "published",
      version: 4,
      published_version: 4,
      published_at: "2026-07-27T09:00:00.000Z",
      updated_by_employee_id: null,
      created_at: "2026-07-27T08:00:00.000Z",
      updated_at: "2026-07-27T10:00:00.000Z",
    } satisfies BrandProfileRecord;

    expect(serializeBrandProfile(profile, null)?.has_unpublished_changes)
      .toBe(false);
  });
});
