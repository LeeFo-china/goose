import { describe, expect, test } from "bun:test";

import {
  BRANDING_ENTITLED_TENANT_FIXTURE_DISPLAY_NAME,
  BRANDING_PLATFORM_FIXTURE_DISPLAY_NAME,
  assertPlatformBrandingFixture,
  assertTenantBrandingFixture,
  readAuthenticatedTenantId,
} from "./verify-branding-tenant-isolation-contracts";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const LOGO_FILE_ID = "20000000-0000-4000-8000-000000000001";
const TIMESTAMP = "2026-07-27T10:00:00.000Z";

const tenantProfile = {
  display_name: BRANDING_ENTITLED_TENANT_FIXTURE_DISPLAY_NAME,
  logo_file_id: LOGO_FILE_ID,
  logo_url: "https://cdn.example.com/logo.png",
  status: "published",
  version: 4,
  published_version: 4,
  has_unpublished_changes: false,
  published_at: TIMESTAMP,
  updated_at: TIMESTAMP,
};

const tenantEffective = {
  source: "tenant",
  tenant_id: TENANT_ID,
  display_name: BRANDING_ENTITLED_TENANT_FIXTURE_DISPLAY_NAME,
  logo_url: "https://cdn.example.com/logo.png",
  support_text:
    `${BRANDING_ENTITLED_TENANT_FIXTURE_DISPLAY_NAME}提供技术支持`,
  version: 4,
  updated_at: TIMESTAMP,
};

const platformEffective = {
  source: "platform",
  tenant_id: null,
  display_name: BRANDING_PLATFORM_FIXTURE_DISPLAY_NAME,
  logo_url: "https://cdn.example.com/platform-logo.png",
  support_text: `${BRANDING_PLATFORM_FIXTURE_DISPLAY_NAME}提供技术支持`,
  version: 3,
  updated_at: TIMESTAMP,
};

const platformProfile = {
  ...tenantProfile,
  display_name: BRANDING_PLATFORM_FIXTURE_DISPLAY_NAME,
  logo_url: "https://cdn.example.com/platform-logo.png",
  version: 3,
  published_version: 3,
};

const entitlement = {
  code: "custom_support_branding",
  status: "active",
  expires_at: "2027-07-27T10:00:00.000Z",
  version: 1,
};

describe("branding smoke response contracts", () => {
  test("reads a strict tenant ID from the authenticated server response", () => {
    expect(
      readAuthenticatedTenantId({
        tenant: { id: TENANT_ID, name: "ignored" },
        permissions: ["ignored"],
      }),
    ).toBe(TENANT_ID);
    expect(() =>
      readAuthenticatedTenantId({
        tenant: {
          id: "10000000-0000-4000-8000-00000000000A",
        },
      })
    ).toThrow(/tenant.*id/i);
    expect(() => readAuthenticatedTenantId({ tenant: null })).toThrow(
      /tenant/i,
    );
  });

  test("accepts the clean with-entitlement tenant fixture", () => {
    expect(() =>
      assertTenantBrandingFixture(
        {
          profile: tenantProfile,
          entitlement,
          can_customize: true,
          effective: tenantEffective,
        },
        { kind: "with_entitlement", tenantId: TENANT_ID },
      )
    ).not.toThrow();
  });

  test("requires null profile/entitlement and platform fallback without entitlement", () => {
    expect(() =>
      assertTenantBrandingFixture(
        {
          profile: null,
          entitlement: null,
          can_customize: false,
          effective: platformEffective,
        },
        { kind: "without_entitlement", tenantId: TENANT_ID },
      )
    ).not.toThrow();

    expect(() =>
      assertTenantBrandingFixture(
        {
          profile: tenantProfile,
          entitlement: null,
          can_customize: false,
          effective: platformEffective,
        },
        { kind: "without_entitlement", tenantId: TENANT_ID },
      )
    ).toThrow(/profile/i);
  });

  test("rejects top-level, profile, and entitlement field leakage", () => {
    expect(() =>
      assertTenantBrandingFixture(
        {
          profile: tenantProfile,
          entitlement,
          can_customize: true,
          effective: tenantEffective,
          internal_tenant_id: "hidden",
        },
        { kind: "with_entitlement", tenantId: TENANT_ID },
      )
    ).toThrow(/exact/i);

    expect(() =>
      assertTenantBrandingFixture(
        {
          profile: { ...tenantProfile, tenant_id: TENANT_ID },
          entitlement,
          can_customize: true,
          effective: tenantEffective,
        },
        { kind: "with_entitlement", tenantId: TENANT_ID },
      )
    ).toThrow(/profile/i);

    expect(() =>
      assertTenantBrandingFixture(
        {
          profile: tenantProfile,
          entitlement: { ...entitlement, id: "hidden" },
          can_customize: true,
          effective: tenantEffective,
        },
        { kind: "with_entitlement", tenantId: TENANT_ID },
      )
    ).toThrow(/entitlement/i);
  });

  test("rejects invalid profile field types and a foreign effective tenant", () => {
    expect(() =>
      assertTenantBrandingFixture(
        {
          profile: { ...tenantProfile, logo_file_id: "not-a-uuid" },
          entitlement,
          can_customize: true,
          effective: tenantEffective,
        },
        { kind: "with_entitlement", tenantId: TENANT_ID },
      )
    ).toThrow(/profile/i);

    expect(() =>
      assertTenantBrandingFixture(
        {
          profile: tenantProfile,
          entitlement,
          can_customize: true,
          effective: {
            ...tenantEffective,
            tenant_id: "10000000-0000-4000-8000-000000000002",
          },
        },
        { kind: "with_entitlement", tenantId: TENANT_ID },
      )
    ).toThrow(/tenant/i);
  });

  test("rejects a structurally valid third-tenant branding canary", () => {
    const thirdTenantName = "品牌联调第三租户";
    expect(() =>
      assertTenantBrandingFixture(
        {
          profile: {
            ...tenantProfile,
            display_name: thirdTenantName,
          },
          entitlement,
          can_customize: true,
          effective: {
            ...tenantEffective,
            display_name: thirdTenantName,
            support_text: `${thirdTenantName}提供技术支持`,
          },
        },
        { kind: "with_entitlement", tenantId: TENANT_ID },
      )
    ).toThrow(/fixture|display/i);
  });

  test("requires the published snapshot and effective branding to agree", () => {
    for (const value of [
      {
        profile: { ...tenantProfile, has_unpublished_changes: true },
        effective: tenantEffective,
      },
      {
        profile: { ...tenantProfile, published_version: 3 },
        effective: tenantEffective,
      },
      {
        profile: tenantProfile,
        effective: { ...tenantEffective, logo_url: "https://other/logo.png" },
      },
      {
        profile: tenantProfile,
        effective: { ...tenantEffective, version: 3 },
      },
      {
        profile: tenantProfile,
        effective: { ...tenantEffective, support_text: "unrelated support" },
      },
    ]) {
      expect(() =>
        assertTenantBrandingFixture(
          {
            ...value,
            entitlement,
            can_customize: true,
          },
          { kind: "with_entitlement", tenantId: TENANT_ID },
        )
      ).toThrow();
    }
  });

  test("requires an exact non-null platform profile and effective fallback", () => {
    expect(() =>
      assertPlatformBrandingFixture({
        profile: platformProfile,
        effective: platformEffective,
      })
    ).not.toThrow();

    expect(() =>
      assertPlatformBrandingFixture({
        profile: null,
        effective: platformEffective,
      })
    ).toThrow(/profile/i);
    expect(() =>
      assertPlatformBrandingFixture({
        profile: platformProfile,
        effective: platformEffective,
        internal: true,
      })
    ).toThrow(/exact/i);
    expect(() =>
      assertPlatformBrandingFixture({
        profile: {
          ...platformProfile,
          display_name: BRANDING_ENTITLED_TENANT_FIXTURE_DISPLAY_NAME,
        },
        effective: platformEffective,
      })
    ).toThrow(/fixture|display/i);
    expect(() =>
      assertPlatformBrandingFixture({
        profile: platformProfile,
        effective: {
          ...platformEffective,
          logo_url: "https://other/platform-logo.png",
        },
      })
    ).toThrow(/snapshot|effective/i);
  });
});
