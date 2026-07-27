import {
  type ExpectedResponse,
  type ParsedSmokeResponse,
  type SmokeEnvironment,
  SmokeAssertionError,
  assertExpectedSmokeResponse,
  formatSmokeMarker,
  isCanonicalUuid,
  isRecord,
  parseSmokeResponse,
  readPlatformListTargetTenantId,
  redactSensitiveText,
  requireRecord,
} from "./verify-branding-tenant-isolation-support";

export {
  assertExpectedSmokeResponse,
  formatSmokeMarker,
  parseSmokeResponse,
  readPlatformListTargetTenantId,
  redactSensitiveText,
} from "./verify-branding-tenant-isolation-support";

type RequiredSmokeConfig = {
  baseUrl: string;
  platformToken: string;
  tenantWithEntitlementToken: string;
  tenantWithoutEntitlementToken: string;
  foreignFileId: string;
  secrets: string[];
};
type RequestInput = {
  label: string;
  path: string;
  method?: "GET" | "PATCH";
  token?: string;
  body?: unknown;
  forbiddenValues?: readonly string[];
  expected: ExpectedResponse;
  validate?: (data: unknown) => void;
};
type RequestExecutor = (input: RequestInput) => Promise<ParsedSmokeResponse>;
const REQUIRED_ENV_NAMES = [
  "BRANDING_API_BASE_URL",
  "BRANDING_PLATFORM_TOKEN",
  "BRANDING_TENANT_WITH_ENTITLEMENT_TOKEN",
  "BRANDING_TENANT_WITHOUT_ENTITLEMENT_TOKEN",
  "BRANDING_FOREIGN_FILE_ID",
] as const;
const EFFECTIVE_KEYS = [
  "display_name",
  "logo_url",
  "source",
  "support_text",
  "tenant_id",
  "updated_at",
  "version",
] as const;
export async function runBrandingTenantIsolationSmoke(
  environment: SmokeEnvironment = process.env,
  write: (line: string) => void = console.log,
): Promise<void> {
  const config = readConfig(environment);
  const withTenantId = readPlatformListTargetTenantId(
    config.tenantWithEntitlementToken,
  );
  const withoutTenantId = readPlatformListTargetTenantId(
    config.tenantWithoutEntitlementToken,
  );
  if (withTenantId === withoutTenantId) {
    throw new SmokeAssertionError(
      "tenant fixture tokens must belong to different tenants",
    );
  }
  let failed = 0;
  const request = createRequestExecutor(config);
  const check = async (input: RequestInput) => {
    let response: ParsedSmokeResponse | null = null;
    try {
      response = await request(input);
      assertExpectedSmokeResponse(response, input.expected);
      input.validate?.(response.data);
      write(formatSmokeMarker(input.label, response, config.secrets));
      return response;
    } catch {
      failed += 1;
      write(response
        ? formatSmokeMarker(input.label, response, config.secrets, "FAIL")
        : `[FAIL] ${redactSensitiveText(input.label, config.secrets)} ` +
          "status=unknown code=SMOKE_ASSERTION_FAILED request_id=null");
      return null;
    }
  };
  await check({
    label: "anonymous/visitor-effective-platform-fallback",
    path: "/branding/effective",
    expected: { status: 200 },
    forbiddenValues: [withTenantId, withoutTenantId, config.foreignFileId],
    validate: (data) => assertEffectiveBranding(data, "platform"),
  });
  await check({
    label: "platform-no-tenant-effective",
    path: "/branding/effective",
    token: config.platformToken,
    expected: { status: 200 },
    forbiddenValues: [withTenantId, withoutTenantId, config.foreignFileId],
    validate: (data) => assertEffectiveBranding(data, "platform"),
  });
  await check({
    label: "tenant-with-entitlement-effective",
    path: "/branding/effective",
    token: config.tenantWithEntitlementToken,
    expected: { status: 200 },
    forbiddenValues: [withoutTenantId, config.foreignFileId],
    validate: (data) => assertEffectiveBranding(data, "tenant", withTenantId),
  });
  await check({
    label: "tenant-without-entitlement-effective-fallback",
    path: "/branding/effective",
    token: config.tenantWithoutEntitlementToken,
    expected: { status: 200 },
    forbiddenValues: [withTenantId, withoutTenantId, config.foreignFileId],
    validate: (data) => assertEffectiveBranding(data, "platform"),
  });
  const withTenantBranding = await check({
    label: "tenant-with-entitlement-branding-read",
    path: "/tenant/branding",
    token: config.tenantWithEntitlementToken,
    expected: { status: 200 },
    forbiddenValues: [withoutTenantId, config.foreignFileId],
    validate: (data) => assertTenantBranding(data, true),
  });
  const withoutTenantBranding = await check({
    label: "tenant-without-entitlement-branding-read",
    path: "/tenant/branding",
    token: config.tenantWithoutEntitlementToken,
    expected: { status: 200 },
    forbiddenValues: [withTenantId, config.foreignFileId],
    validate: (data) => assertTenantBranding(data, false),
  });
  await check({
    label: "tenant-without-entitlement-draft-rejected",
    path: "/tenant/branding",
    method: "PATCH",
    token: config.tenantWithoutEntitlementToken,
    body: mutationBody(withoutTenantBranding?.data, config.foreignFileId),
    expected: {
      status: 403,
      code: "BRANDING_ENTITLEMENT_REQUIRED",
    },
    forbiddenValues: [withTenantId, config.foreignFileId],
  });
  await check({
    label: "tenant-foreign-logo-binding-hidden",
    path: "/tenant/branding",
    method: "PATCH",
    token: config.tenantWithEntitlementToken,
    body: mutationBody(withTenantBranding?.data, config.foreignFileId),
    expected: {
      status: 404,
      code: "BRANDING_LOGO_FILE_NOT_FOUND",
    },
    forbiddenValues: [withoutTenantId, config.foreignFileId],
  });
  await check({
    label: "platform-branding-permission",
    path: "/platform/branding",
    token: config.platformToken,
    expected: { status: 200 },
    forbiddenValues: [withTenantId, withoutTenantId, config.foreignFileId],
    validate: assertPlatformBranding,
  });
  await check({
    label: "tenant-cannot-read-platform-branding",
    path: "/platform/branding",
    token: config.tenantWithEntitlementToken,
    expected: { status: 403, code: "FORBIDDEN" },
    forbiddenValues: [withoutTenantId, config.foreignFileId],
  });
  await check({
    label: "platform-entitlement-list-pagination",
    path: `/platform/tenants/${encodeURIComponent(withTenantId)}` +
      "/entitlements?page=1&pageSize=20",
    token: config.platformToken,
    expected: { status: 200 },
    forbiddenValues: [withoutTenantId, config.foreignFileId],
    validate: (data) => assertEntitlementList(data, withTenantId),
  });
  write(
    `[SUMMARY] branding-tenant-isolation passed=${11 - failed} ` +
      `failed=${failed}`,
  );
  if (failed > 0) process.exitCode = 1;
}
function createRequestExecutor(config: RequiredSmokeConfig): RequestExecutor {
  return async (input) => {
    const response = await fetch(`${config.baseUrl}${input.path}`, {
      method: input.method ?? "GET",
      headers: {
        ...(input.token
          ? { authorization: `Bearer ${input.token}` }
          : {}),
        ...(input.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      body: input.body === undefined
        ? undefined
        : JSON.stringify(input.body),
    });
    const parsed = parseSmokeResponse({
      status: response.status,
      text: await response.text(),
      forbiddenValues: input.forbiddenValues,
    });
    return parsed;
  };
}
function readConfig(environment: SmokeEnvironment): RequiredSmokeConfig {
  const missing = REQUIRED_ENV_NAMES.filter((name) =>
    !environment[name]?.trim()
  );
  if (missing.length > 0) {
    throw new SmokeAssertionError(
      `missing required environment variables: ${missing.join(", ")}`,
    );
  }
  const foreignFileId =
    environment.BRANDING_FOREIGN_FILE_ID?.trim() ?? "";
  if (!isCanonicalUuid(foreignFileId)) {
    throw new SmokeAssertionError(
      "BRANDING_FOREIGN_FILE_ID must be a UUID",
    );
  }
  return {
    baseUrl: normalizeBaseUrl(
      environment.BRANDING_API_BASE_URL?.trim() ?? "",
    ),
    platformToken: environment.BRANDING_PLATFORM_TOKEN?.trim() ?? "",
    tenantWithEntitlementToken:
      environment.BRANDING_TENANT_WITH_ENTITLEMENT_TOKEN?.trim() ?? "",
    tenantWithoutEntitlementToken:
      environment.BRANDING_TENANT_WITHOUT_ENTITLEMENT_TOKEN?.trim() ?? "",
    foreignFileId,
    secrets: REQUIRED_ENV_NAMES.flatMap((name) => {
      const value = environment[name]?.trim();
      return value ? [value] : [];
    }),
  };
}
function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SmokeAssertionError("BRANDING_API_BASE_URL is invalid");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new SmokeAssertionError(
      "BRANDING_API_BASE_URL must be an HTTP(S) origin",
    );
  }
  return url.origin;
}
function mutationBody(data: unknown, foreignFileId: string) {
  const tenantBranding = isRecord(data) ? data : {};
  const profile = isRecord(tenantBranding.profile)
    ? tenantBranding.profile
    : null;
  const version = profile && Number.isSafeInteger(profile.version)
    ? profile.version
    : 0;
  const displayName = profile && typeof profile.display_name === "string"
    ? profile.display_name
    : "品牌隔离校验";
  return {
    display_name: displayName,
    logo_file_id: foreignFileId,
    version,
  };
}
function assertEffectiveBranding(
  data: unknown,
  expectedSource?: "platform" | "tenant",
  expectedTenantId?: string,
): void {
  const value = requireRecord(data, "effective branding data");
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...EFFECTIVE_KEYS].sort())) {
    throw new SmokeAssertionError(
      "effective branding must contain exactly seven public fields",
    );
  }
  if (
    (value.source !== "platform" && value.source !== "tenant") ||
    (expectedSource && value.source !== expectedSource) ||
    typeof value.display_name !== "string" ||
    !value.display_name.trim() ||
    typeof value.logo_url !== "string" ||
    !value.logo_url ||
    typeof value.support_text !== "string" ||
    !value.support_text ||
    !Number.isSafeInteger(value.version) ||
    typeof value.updated_at !== "string" ||
    !Number.isFinite(new Date(value.updated_at).getTime())
  ) {
    throw new SmokeAssertionError("effective branding fields are invalid");
  }
  if (value.source === "platform" && value.tenant_id !== null) {
    throw new SmokeAssertionError("platform branding must not expose tenant_id");
  }
  if (
    value.source === "tenant" &&
    (
      typeof value.tenant_id !== "string" ||
      !isCanonicalUuid(value.tenant_id) ||
      (expectedTenantId && value.tenant_id !== expectedTenantId)
    )
  ) {
    throw new SmokeAssertionError("tenant effective branding scope is invalid");
  }
}
function assertTenantBranding(
  data: unknown,
  expectedCanCustomize: boolean,
): void {
  const value = requireRecord(data, "tenant branding data");
  if (
    !Object.hasOwn(value, "profile") ||
    !Object.hasOwn(value, "entitlement") ||
    value.can_customize !== expectedCanCustomize
  ) {
    throw new SmokeAssertionError("tenant branding summary is invalid");
  }
  if (!expectedCanCustomize && value.entitlement !== null) {
    throw new SmokeAssertionError(
      "tenant without entitlement must return a null summary",
    );
  }
  if (expectedCanCustomize) {
    const entitlement = requireRecord(
      value.entitlement,
      "tenant entitlement summary",
    );
    if (
      entitlement.code !== "custom_support_branding" ||
      entitlement.status !== "active"
    ) {
      throw new SmokeAssertionError(
        "tenant entitlement summary must be active",
      );
    }
  }
  assertEffectiveBranding(value.effective);
}
function assertPlatformBranding(data: unknown): void {
  const value = requireRecord(data, "platform branding data");
  if (!Object.hasOwn(value, "profile")) {
    throw new SmokeAssertionError("platform branding profile is missing");
  }
  assertEffectiveBranding(value.effective, "platform");
}
function assertEntitlementList(data: unknown, tenantId: string): void {
  const value = requireRecord(data, "entitlement list data");
  const pagination = requireRecord(
    value.pagination,
    "entitlement pagination",
  );
  if (
    !Array.isArray(value.list) ||
    pagination.page !== 1 ||
    pagination.pageSize !== 20 ||
    typeof pagination.total !== "number" ||
    typeof pagination.totalPages !== "number"
  ) {
    throw new SmokeAssertionError("entitlement pagination is invalid");
  }
  let foundCustomBranding = false;
  for (const item of value.list) {
    const entitlement = requireRecord(item, "entitlement item");
    if (entitlement.tenant_id !== tenantId) {
      throw new SmokeAssertionError(
        "entitlement list contains a foreign tenant",
      );
    }
    if (
      entitlement.code === "custom_support_branding" &&
      entitlement.status === "active"
    ) {
      foundCustomBranding = true;
    }
  }
  if (!foundCustomBranding) {
    throw new SmokeAssertionError(
      "active custom branding entitlement is missing",
    );
  }
}
if (import.meta.main) {
  await runBrandingTenantIsolationSmoke();
}
