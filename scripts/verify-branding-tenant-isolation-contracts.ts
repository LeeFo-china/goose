import {
  SmokeAssertionError,
  isCanonicalUuid,
  requireRecord,
} from "./verify-branding-tenant-isolation-support";

const EFFECTIVE_KEYS = [
  "source",
  "tenant_id",
  "display_name",
  "logo_url",
  "support_text",
  "version",
  "updated_at",
] as const;
const PROFILE_KEYS = [
  "display_name",
  "logo_file_id",
  "logo_url",
  "status",
  "version",
  "published_version",
  "has_unpublished_changes",
  "published_at",
  "updated_at",
] as const;
const ENTITLEMENT_SUMMARY_KEYS = [
  "code",
  "status",
  "expires_at",
  "version",
] as const;
const TENANT_BRANDING_KEYS = [
  "profile",
  "entitlement",
  "can_customize",
  "effective",
] as const;
const PLATFORM_BRANDING_KEYS = ["profile", "effective"] as const;

type TenantFixtureExpectation = {
  kind: "with_entitlement" | "without_entitlement";
  tenantId: string;
};

export function assertTenantBrandingFixture(
  data: unknown,
  expected: TenantFixtureExpectation,
): void {
  const value = requireRecord(data, "tenant branding data");
  assertExactKeys(value, TENANT_BRANDING_KEYS, "tenant branding data");

  if (expected.kind === "without_entitlement") {
    if (
      value.profile !== null ||
      value.entitlement !== null ||
      value.can_customize !== false
    ) {
      throw new SmokeAssertionError(
        "tenant without entitlement requires null profile and entitlement",
      );
    }
    assertEffectiveBranding(value.effective, "platform", null);
    return;
  }

  if (value.can_customize !== true) {
    throw new SmokeAssertionError(
      "tenant with entitlement must be customizable",
    );
  }
  const profile = assertBrandProfile(value.profile);
  if (profile.status !== "published") {
    throw new SmokeAssertionError(
      "tenant with entitlement profile must be published",
    );
  }
  assertEntitlementSummary(value.entitlement);
  assertEffectiveBranding(
    value.effective,
    "tenant",
    expected.tenantId,
  );
}

export function assertPlatformBrandingFixture(data: unknown): void {
  const value = requireRecord(data, "platform branding data");
  assertExactKeys(value, PLATFORM_BRANDING_KEYS, "platform branding data");
  const profile = assertBrandProfile(value.profile);
  if (profile.status !== "published") {
    throw new SmokeAssertionError(
      "platform branding profile must be published",
    );
  }
  assertEffectiveBranding(value.effective, "platform", null);
}

export function assertEffectiveBranding(
  data: unknown,
  expectedSource: "platform" | "tenant",
  expectedTenantId: string | null,
): void {
  const value = requireRecord(data, "effective branding data");
  assertExactKeys(value, EFFECTIVE_KEYS, "effective branding data");
  if (
    value.source !== expectedSource ||
    value.tenant_id !== expectedTenantId ||
    !isNonBlankString(value.display_name) ||
    !isNonBlankString(value.logo_url) ||
    !isNonBlankString(value.support_text) ||
    !isPositiveOrZeroSafeInteger(value.version) ||
    !isIsoTimestamp(value.updated_at)
  ) {
    throw new SmokeAssertionError(
      "effective branding fields or tenant scope are invalid",
    );
  }
  if (
    expectedSource === "tenant" &&
    (
      typeof expectedTenantId !== "string" ||
      !isCanonicalUuid(expectedTenantId)
    )
  ) {
    throw new SmokeAssertionError(
      "effective branding tenant scope is invalid",
    );
  }
}

function assertBrandProfile(value: unknown) {
  const profile = requireRecord(value, "branding profile");
  assertExactKeys(profile, PROFILE_KEYS, "branding profile");
  if (
    !isNonBlankString(profile.display_name) ||
    typeof profile.logo_file_id !== "string" ||
    !isCanonicalUuid(profile.logo_file_id) ||
    !isNonBlankString(profile.logo_url) ||
    (
      profile.status !== "draft" &&
      profile.status !== "published" &&
      profile.status !== "disabled"
    ) ||
    !isPositiveSafeInteger(profile.version) ||
    !isNullablePositiveSafeInteger(profile.published_version) ||
    typeof profile.has_unpublished_changes !== "boolean" ||
    !isNullableIsoTimestamp(profile.published_at) ||
    !isIsoTimestamp(profile.updated_at)
  ) {
    throw new SmokeAssertionError("branding profile fields are invalid");
  }
  if (
    typeof profile.published_version === "number" &&
    profile.published_version > profile.version
  ) {
    throw new SmokeAssertionError(
      "branding profile published version is invalid",
    );
  }
  return profile;
}

function assertEntitlementSummary(value: unknown): void {
  const entitlement = requireRecord(
    value,
    "tenant entitlement summary",
  );
  assertExactKeys(
    entitlement,
    ENTITLEMENT_SUMMARY_KEYS,
    "tenant entitlement summary",
  );
  if (
    entitlement.code !== "custom_support_branding" ||
    entitlement.status !== "active" ||
    !isIsoTimestamp(entitlement.expires_at) ||
    !isPositiveSafeInteger(entitlement.version)
  ) {
    throw new SmokeAssertionError(
      "tenant entitlement summary fields are invalid",
    );
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value);
  if (
    actual.length !== expected.length ||
    !expected.every((key) => actual.includes(key))
  ) {
    throw new SmokeAssertionError(`${label} must use the exact field set`);
  }
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value === value.trim();
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) &&
    typeof value === "number" &&
    value > 0;
}

function isPositiveOrZeroSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) &&
    typeof value === "number" &&
    value >= 0;
}

function isNullablePositiveSafeInteger(value: unknown): boolean {
  return value === null || isPositiveSafeInteger(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString() === value;
}

function isNullableIsoTimestamp(value: unknown): boolean {
  return value === null || isIsoTimestamp(value);
}
