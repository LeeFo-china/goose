import {
  BRANDING_SMOKE_RESPONSE_MAX_BYTES,
  BRANDING_SMOKE_TIMEOUT_MS,
  type ExpectedResponse,
  type ParsedSmokeResponse,
  type SmokeEnvironment,
  SmokeAssertionError,
  assertExpectedSmokeResponse,
  createBrandingSmokeAbortSignal,
  formatSmokeMarker,
  isCanonicalUuid,
  normalizeBrandingApiBaseUrl,
  parseSmokeResponse,
  readBoundedResponseText,
  readPlatformListTargetTenantId,
  redactSensitiveText,
  requireRecord,
} from "./verify-branding-tenant-isolation-support";
import {
  assertEffectiveBranding,
  assertPlatformBrandingFixture,
  assertTenantBrandingFixture,
} from "./verify-branding-tenant-isolation-contracts";

export {
  BRANDING_SMOKE_RESPONSE_MAX_BYTES,
  BRANDING_SMOKE_TIMEOUT_MS,
  assertExpectedSmokeResponse,
  createBrandingSmokeAbortSignal,
  formatSmokeMarker,
  normalizeBrandingApiBaseUrl,
  parseSmokeResponse,
  readBoundedResponseText,
  readPlatformListTargetTenantId,
  redactSensitiveText,
} from "./verify-branding-tenant-isolation-support";

export const BRANDING_MUTATION_SENTINEL_VERSION = 2_147_483_647;

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
type SmokeFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
type SmokeDependencies = {
  fetch?: SmokeFetch;
  createAbortSignal?: () => AbortSignal;
};
export type BrandingTenantIsolationSmokeResult = {
  passed: number;
  failed: number;
};
const REQUIRED_ENV_NAMES = [
  "BRANDING_API_BASE_URL",
  "BRANDING_PLATFORM_TOKEN",
  "BRANDING_TENANT_WITH_ENTITLEMENT_TOKEN",
  "BRANDING_TENANT_WITHOUT_ENTITLEMENT_TOKEN",
  "BRANDING_FOREIGN_FILE_ID",
] as const;
export async function runBrandingTenantIsolationSmoke(
  environment: SmokeEnvironment = process.env,
  write: (line: string) => void = console.log,
  dependencies: SmokeDependencies = {},
): Promise<BrandingTenantIsolationSmokeResult> {
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
  const request = createRequestExecutor(config, dependencies);
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
    validate: (data) => assertEffectiveBranding(data, "platform", null),
  });
  await check({
    label: "platform-no-tenant-effective",
    path: "/branding/effective",
    token: config.platformToken,
    expected: { status: 200 },
    forbiddenValues: [withTenantId, withoutTenantId, config.foreignFileId],
    validate: (data) => assertEffectiveBranding(data, "platform", null),
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
    validate: (data) => assertEffectiveBranding(data, "platform", null),
  });
  await check({
    label: "tenant-with-entitlement-branding-read",
    path: "/tenant/branding",
    token: config.tenantWithEntitlementToken,
    expected: { status: 200 },
    forbiddenValues: [withoutTenantId, config.foreignFileId],
    validate: (data) =>
      assertTenantBrandingFixture(data, {
        kind: "with_entitlement",
        tenantId: withTenantId,
      }),
  });
  await check({
    label: "tenant-without-entitlement-branding-read",
    path: "/tenant/branding",
    token: config.tenantWithoutEntitlementToken,
    expected: { status: 200 },
    forbiddenValues: [withTenantId, config.foreignFileId],
    validate: (data) =>
      assertTenantBrandingFixture(data, {
        kind: "without_entitlement",
        tenantId: withoutTenantId,
      }),
  });
  await check({
    label: "tenant-without-entitlement-draft-rejected",
    path: "/tenant/branding",
    method: "PATCH",
    token: config.tenantWithoutEntitlementToken,
    body: mutationBody(config.foreignFileId),
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
    body: mutationBody(config.foreignFileId),
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
    validate: assertPlatformBrandingFixture,
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
  return { passed: 11 - failed, failed };
}
function createRequestExecutor(
  config: RequiredSmokeConfig,
  dependencies: SmokeDependencies,
): RequestExecutor {
  const fetchRequest = dependencies.fetch ?? fetch;
  const createAbortSignal = dependencies.createAbortSignal ??
    createBrandingSmokeAbortSignal;
  return async (input) => {
    const response = await fetchRequest(`${config.baseUrl}${input.path}`, {
      method: input.method ?? "GET",
      signal: createAbortSignal(),
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
      text: await readBoundedResponseText(response),
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
    baseUrl: normalizeBrandingApiBaseUrl(
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
function mutationBody(foreignFileId: string) {
  return {
    display_name: "品牌隔离校验",
    logo_file_id: foreignFileId,
    version: BRANDING_MUTATION_SENTINEL_VERSION,
  };
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
  try {
    const result = await runBrandingTenantIsolationSmoke();
    if (result.failed > 0) process.exitCode = 1;
  } catch {
    console.error(
      "[FAIL] branding-tenant-isolation status=unknown " +
        "code=SMOKE_ASSERTION_FAILED request_id=null",
    );
    process.exitCode = 1;
  }
}
