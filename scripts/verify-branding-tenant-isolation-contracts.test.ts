import { describe, expect, test } from "bun:test";

import {
  assertPlatformBrandingFixture,
  assertTenantBrandingFixture,
} from "./verify-branding-tenant-isolation-contracts";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const LOGO_FILE_ID = "20000000-0000-4000-8000-000000000001";
const TIMESTAMP = "2026-07-27T10:00:00.000Z";

const profile = {
  display_name: "晴天装饰",
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
  display_name: "晴天装饰",
  logo_url: "https://cdn.example.com/logo.png",
  support_text: "晴天装饰提供技术支持",
  version: 4,
  updated_at: TIMESTAMP,
};

const platformEffective = {
  ...tenantEffective,
  source: "platform",
  tenant_id: null,
  display_name: "字节跳动",
  support_text: "字节跳动提供技术支持",
};

const entitlement = {
  code: "custom_support_branding",
  status: "active",
  expires_at: "2027-07-27T10:00:00.000Z",
  version: 1,
};

describe("branding smoke response contracts", () => {
  test("accepts the clean with-entitlement tenant fixture", () => {
    expect(() =>
      assertTenantBrandingFixture(
        {
          profile,
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
          profile,
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
          profile,
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
          profile: { ...profile, tenant_id: TENANT_ID },
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
          profile,
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
          profile: { ...profile, logo_file_id: "not-a-uuid" },
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
          profile,
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

  test("requires an exact non-null platform profile and effective fallback", () => {
    expect(() =>
      assertPlatformBrandingFixture({
        profile,
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
        profile,
        effective: platformEffective,
        internal: true,
      })
    ).toThrow(/exact/i);
  });
});
