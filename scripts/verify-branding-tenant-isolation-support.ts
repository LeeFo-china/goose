export type JsonRecord = Record<string, unknown>;
export type SmokeEnvironment = Record<string, string | undefined>;

export type ParsedSmokeResponse = {
  status: number;
  code: string | null;
  requestId: string | null;
  message: string | null;
  data: unknown;
  isSuccessEnvelope: boolean;
  isErrorEnvelope: boolean;
};

export type ExpectedResponse = {
  status: number;
  code?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu;
const BEARER_PATTERN = /\bBearer\s+[^\s"',}]+/giu;
const AUTHORIZATION_HEADER_PATTERN =
  /(\bauthorization\s*:\s*)([^\r\n]+)/giu;
const AUTHORIZATION_JSON_PATTERN =
  /(["']authorization["']\s*:\s*["'])([^"']+)(["'])/giu;

export class SmokeAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmokeAssertionError";
  }
}

export function isCanonicalUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function redactSensitiveText(
  value: string,
  secrets: readonly string[] = [],
): string {
  let redacted = value;
  for (const secret of secrets) {
    if (!secret) continue;
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted
    .replace(
      AUTHORIZATION_HEADER_PATTERN,
      (_match, prefix: string, credential: string) =>
        `${prefix}${
          credential.trim().toLowerCase().startsWith("bearer ")
            ? "Bearer [REDACTED]"
            : "[REDACTED]"
        }`,
    )
    .replace(AUTHORIZATION_JSON_PATTERN, "$1[REDACTED]$3")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(JWT_PATTERN, "[REDACTED_JWT]");
}

export function parseSmokeResponse(input: {
  status: number;
  text: string;
  forbiddenValues?: readonly string[];
}): ParsedSmokeResponse {
  for (const value of input.forbiddenValues ?? []) {
    if (value && input.text.includes(value)) {
      throw new SmokeAssertionError(
        "response contains a foreign identifier",
      );
    }
  }

  let payload: unknown;
  try {
    payload = input.text ? JSON.parse(input.text) : null;
  } catch {
    throw new SmokeAssertionError("response is not valid JSON");
  }
  if (!isRecord(payload)) {
    throw new SmokeAssertionError("response JSON must be an object");
  }

  const isSuccessEnvelope = Object.hasOwn(payload, "data") &&
    typeof payload.message === "string";
  const isErrorEnvelope = payload.success === false &&
    typeof payload.message === "string" &&
    typeof payload.code === "string";
  if (!isSuccessEnvelope && !isErrorEnvelope) {
    throw new SmokeAssertionError("response envelope is invalid");
  }

  return {
    status: input.status,
    code: optionalString(payload.code),
    requestId: optionalString(payload.requestId) ??
      optionalString(payload.request_id),
    message: optionalString(payload.message),
    data: isSuccessEnvelope ? payload.data : null,
    isSuccessEnvelope,
    isErrorEnvelope,
  };
}

export function assertExpectedSmokeResponse(
  response: ParsedSmokeResponse,
  expected: ExpectedResponse,
): void {
  if (response.status !== expected.status) {
    throw new SmokeAssertionError(
      `expected HTTP ${expected.status}, got HTTP ${response.status}`,
    );
  }
  if (expected.code !== undefined && response.code !== expected.code) {
    throw new SmokeAssertionError(
      `expected code ${expected.code}, got ${response.code ?? "null"}`,
    );
  }
  if (expected.status >= 400 && !response.isErrorEnvelope) {
    throw new SmokeAssertionError("expected an error response envelope");
  }
  if (expected.status < 400 && !response.isSuccessEnvelope) {
    throw new SmokeAssertionError("expected a success response envelope");
  }
}

export function formatSmokeMarker(
  label: string,
  response: ParsedSmokeResponse,
  secrets: readonly string[] = [],
  outcome: "PASS" | "FAIL" = "PASS",
): string {
  const safeLabel = redactSensitiveText(label, secrets);
  const safeCode = redactSensitiveText(response.code ?? "none", secrets);
  const safeRequestId = redactSensitiveText(
    response.requestId ?? "null",
    secrets,
  );
  return `[${outcome}] ${safeLabel} status=${response.status} ` +
    `code=${safeCode} request_id=${safeRequestId}`;
}

/**
 * This unverified claim is used only to select the target of a platform-admin
 * list request. It is never an authorization source: the API still authorizes
 * the request from BRANDING_PLATFORM_TOKEN and its server-side AuthContext.
 */
export function readPlatformListTargetTenantId(token: string): string {
  const parts = token.split(".");
  const encodedPayload = parts[1];
  if (parts.length !== 3 || !encodedPayload) {
    throw new SmokeAssertionError("tenant fixture token must be a JWT");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    throw new SmokeAssertionError("tenant fixture JWT payload is invalid");
  }
  const tenantId = isRecord(payload)
    ? optionalString(payload.tenant_id)
    : null;
  if (!tenantId || !isCanonicalUuid(tenantId)) {
    throw new SmokeAssertionError(
      "tenant fixture JWT must contain a tenant_id UUID claim",
    );
  }
  return tenantId;
}

export function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new SmokeAssertionError(`${label} must be an object`);
  }
  return value;
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
