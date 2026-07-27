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

export const BRANDING_SMOKE_TIMEOUT_MS = 15_000;
export const BRANDING_SMOKE_RESPONSE_MAX_BYTES = 1024 * 1024;
const MAX_MARKER_FIELD_LENGTH = 128;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu;
const BEARER_PATTERN = /\bBearer\s+[^\s"',}]+/giu;
const AUTHORIZATION_HEADER_PATTERN =
  /(\bauthorization\s*:\s*)([^\r\n]+)/giu;
const AUTHORIZATION_JSON_PATTERN =
  /(["']authorization["']\s*:\s*["'])([^"']+)(["'])/giu;
const STABLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/u;
const FORBIDDEN_MARKER_CHARACTER_PATTERN =
  /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

export class SmokeAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmokeAssertionError";
  }
}

export function isCanonicalUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function createBrandingSmokeAbortSignal(): AbortSignal {
  return AbortSignal.timeout(BRANDING_SMOKE_TIMEOUT_MS);
}

export function normalizeBrandingApiBaseUrl(value: string): string {
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
  if (
    url.protocol === "http:" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "localhost" &&
    url.hostname !== "[::1]"
  ) {
    throw new SmokeAssertionError(
      "remote BRANDING_API_BASE_URL must use HTTPS",
    );
  }
  return url.origin;
}

export async function readBoundedResponseText(
  response: Pick<Response, "body" | "headers">,
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) {
      await response.body?.cancel();
      throw new SmokeAssertionError("response Content-Length is invalid");
    }
    if (Number(contentLength) > BRANDING_SMOKE_RESPONSE_MAX_BYTES) {
      await response.body?.cancel();
      throw new SmokeAssertionError("response body is too large");
    }
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > BRANDING_SMOKE_RESPONSE_MAX_BYTES) {
        await reader.cancel();
        throw new SmokeAssertionError("response body is too large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes).toString("utf8");
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

  const keys = Object.keys(payload);
  const isSuccessEnvelope = hasExactKeys(keys, ["data", "message"]) &&
    isNonBlankString(payload.message);
  const isErrorEnvelope = payload.success === false &&
    isNonBlankString(payload.message) &&
    isNonBlankString(payload.code) &&
    keys.every((key) =>
      [
        "success",
        "message",
        "code",
        "details",
        "requestId",
        "request_id",
      ].includes(key)
    ) &&
    !Object.hasOwn(payload, "data") &&
    !(Object.hasOwn(payload, "requestId") &&
      Object.hasOwn(payload, "request_id"));
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
  if (
    expected.status >= 400 &&
    (
      !response.requestId ||
      !isSafeRequestId(response.requestId) ||
      !response.code ||
      !STABLE_CODE_PATTERN.test(response.code)
    )
  ) {
    throw new SmokeAssertionError(
      "error response requires a safe non-empty request_id and code",
    );
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
  const safeLabel = safeMarkerValue(
    redactSensitiveText(label, secrets),
    true,
  );
  const safeCode = response.code === null
    ? "none"
    : STABLE_CODE_PATTERN.test(response.code)
    ? safeMarkerValue(redactSensitiveText(response.code, secrets), false)
    : "INVALID";
  const safeRequestId = response.requestId === null
    ? "null"
    : safeMarkerValue(
      redactSensitiveText(response.requestId, secrets),
      false,
    );
  return `[${outcome}] ${safeLabel} status=${response.status} ` +
    `code=${safeCode} request_id=${safeRequestId}`;
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

function hasExactKeys(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length &&
    expected.every((key) => actual.includes(key));
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeRequestId(value: string): boolean {
  return value.length <= MAX_MARKER_FIELD_LENGTH &&
    !/\s/u.test(value) &&
    !FORBIDDEN_MARKER_CHARACTER_PATTERN.test(value);
}

function safeMarkerValue(value: string, allowSpaces: boolean): string {
  if (
    value.length === 0 ||
    value.length > MAX_MARKER_FIELD_LENGTH ||
    FORBIDDEN_MARKER_CHARACTER_PATTERN.test(value) ||
    (!allowSpaces && /\s/u.test(value))
  ) {
    return "INVALID";
  }
  return value;
}
