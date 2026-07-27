import {
  SmokeAssertionError,
  isCanonicalUuid,
  requireRecord,
} from "./verify-branding-tenant-isolation-support";

export const BRANDING_PLATFORM_FIXTURE_DISPLAY_NAME = "品牌联调平台";
export const BRANDING_ENTITLED_TENANT_FIXTURE_DISPLAY_NAME =
  "品牌联调有权益租户";

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

export function readAuthenticatedTenantId(data: unknown): string {
  const value = requireRecord(data, "authenticated user data");
  const tenant = requireRecord(value.tenant, "authenticated tenant");
  if (
    typeof tenant.id !== "string" ||
    !isCanonicalUuid(tenant.id)
  ) {
    throw new SmokeAssertionError(
      "authenticated tenant.id must be a canonical UUID",
    );
  }
  return tenant.id;
}

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
  const profile = assertPublishedFixtureProfile(
    value.profile,
    BRANDING_ENTITLED_TENANT_FIXTURE_DISPLAY_NAME,
  );
  assertEntitlementSummary(value.entitlement);
  const effective = assertEffectiveBranding(
    value.effective,
    "tenant",
    expected.tenantId,
  );
  assertEffectiveMatchesPublishedProfile(effective, profile);
}

export function assertPlatformBrandingFixture(data: unknown): void {
  const value = requireRecord(data, "platform branding data");
  assertExactKeys(value, PLATFORM_BRANDING_KEYS, "platform branding data");
  const profile = assertPublishedFixtureProfile(
    value.profile,
    BRANDING_PLATFORM_FIXTURE_DISPLAY_NAME,
  );
  const effective = assertEffectiveBranding(
    value.effective,
    "platform",
    null,
  );
  assertEffectiveMatchesPublishedProfile(effective, profile);
}

export function assertEffectiveBranding(
  data: unknown,
  expectedSource: "platform" | "tenant",
  expectedTenantId: string | null,
): Record<string, unknown> {
  const value = requireRecord(data, "effective branding data");
  assertExactKeys(value, EFFECTIVE_KEYS, "effective branding data");
  const expectedDisplayName = expectedSource === "platform"
    ? BRANDING_PLATFORM_FIXTURE_DISPLAY_NAME
    : BRANDING_ENTITLED_TENANT_FIXTURE_DISPLAY_NAME;
  if (
    value.source !== expectedSource ||
    value.tenant_id !== expectedTenantId ||
    value.display_name !== expectedDisplayName ||
    !isNonBlankString(value.logo_url) ||
    value.support_text !== `${expectedDisplayName}提供技术支持` ||
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
  return value;
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

function assertPublishedFixtureProfile(
  value: unknown,
  expectedDisplayName: string,
): Record<string, unknown> {
  const profile = assertBrandProfile(value);
  if (
    profile.display_name !== expectedDisplayName ||
    profile.status !== "published" ||
    profile.has_unpublished_changes !== false ||
    profile.published_version !== profile.version ||
    profile.published_at === null
  ) {
    throw new SmokeAssertionError(
      "branding fixture profile must be the clean published canary",
    );
  }
  return profile;
}

function assertEffectiveMatchesPublishedProfile(
  effective: Record<string, unknown>,
  profile: Record<string, unknown>,
): void {
  if (
    effective.display_name !== profile.display_name ||
    effective.logo_url !== profile.logo_url ||
    effective.version !== profile.published_version
  ) {
    throw new SmokeAssertionError(
      "effective branding must match the published profile snapshot",
    );
  }
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
