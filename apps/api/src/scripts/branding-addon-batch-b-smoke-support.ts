import { createHash } from "node:crypto";

type EnvLike = Record<string, string | undefined>;
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type BrandingAddonBatchBSmokeConfig = {
  baseUrl: string;
  adminToken: string;
  isolationToken: string;
  platformToken: string | null;
  realPayRequested: boolean;
};

type ParseConfigResult =
  | { ok: true; config: BrandingAddonBatchBSmokeConfig }
  | { ok: false; errors: string[] };

export type SmokeEvidence = {
  name: string;
  method: string;
  path: string;
  http_status: number;
  code: string | null;
  request_id: string | null;
  response: unknown;
};

export type ApiResult = {
  payload: Record<string, unknown>;
  data: Record<string, unknown>;
  evidence: SmokeEvidence;
};

const REDACTED = "[REDACTED]";
const DEFAULT_HTTP_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BODY_CHARS = 256 * 1024;
const SENSITIVE_KEY_PATTERN =
  /(token|openid|secret|api.?v3|pay.?sign|nonce|package|prepay|transaction.?id|out.?trade.?no|payment.?request)/i;

export class BrandingAddonSmokeFailure extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly http_status: number,
    public readonly request_id: string | null,
    public readonly response: unknown,
  ) {
    super(message);
    this.name = "BrandingAddonSmokeFailure";
  }
}

export function parseBrandingAddonBatchBSmokeConfig(
  env: EnvLike = process.env,
  args: string[] = process.argv.slice(2),
): ParseConfigResult {
  const errors: string[] = [];
  const primaryBaseUrl = normalizeBaseUrl(env.API_BASE_URL);
  const legacyBaseUrl = normalizeBaseUrl(env.GOOES_API_BASE_URL);
  const baseUrl = primaryBaseUrl ?? legacyBaseUrl;
  const adminToken = trimOptional(env.BRANDING_ADDON_SMOKE_ADMIN_TOKEN);
  const isolationToken = trimOptional(
    env.BRANDING_ADDON_SMOKE_ISOLATION_TOKEN,
  );
  const platformToken = trimOptional(
    env.BRANDING_ADDON_SMOKE_PLATFORM_TOKEN,
  ) ?? null;

  if (!baseUrl) errors.push("API_BASE_URL is required");
  if (
    primaryBaseUrl &&
    legacyBaseUrl &&
    primaryBaseUrl !== legacyBaseUrl
  ) {
    errors.push(
      "API_BASE_URL and GOOES_API_BASE_URL must match when both are set",
    );
  }
  if (!adminToken) {
    errors.push("BRANDING_ADDON_SMOKE_ADMIN_TOKEN is required");
  }
  if (!isolationToken) {
    errors.push("BRANDING_ADDON_SMOKE_ISOLATION_TOKEN is required");
  }
  if (baseUrl && !isHttpUrl(baseUrl)) {
    errors.push("API_BASE_URL must be an absolute HTTP(S) URL");
  }
  if (adminToken && isolationToken && adminToken === isolationToken) {
    errors.push(
      "BRANDING_ADDON_SMOKE_ADMIN_TOKEN and BRANDING_ADDON_SMOKE_ISOLATION_TOKEN must differ",
    );
  }
  if (errors.length > 0 || !baseUrl || !adminToken || !isolationToken) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      baseUrl,
      adminToken,
      isolationToken,
      platformToken,
      realPayRequested: args.includes("--real-pay"),
    },
  };
}

export function redactBrandingAddonSmokeValue(
  value: unknown,
  secretValues: readonly string[] = [],
): unknown {
  return redactValue(
    value,
    "",
    secretValues.filter(Boolean),
    new WeakSet<object>(),
  );
}

function redactValue(
  value: unknown,
  key: string,
  secretValues: readonly string[],
  seen: WeakSet<object>,
): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return REDACTED;
  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, "", secretValues, seen));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactValue(childValue, childKey, secretValues, seen),
      ]),
    );
  }
  if (typeof value === "string") {
    const scrubbed = secretValues.reduce(
      (current, secret) => current.split(secret).join(REDACTED),
      value,
    );
    if (scrubbed !== value) return scrubbed;
  }
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    return stripUrlQuery(value);
  }
  return value;
}

export async function requestBrandingAddonSmokeJson(input: {
  name: string;
  baseUrl: string;
  path: string;
  token: string;
  fetchImpl: FetchLike;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  expectedStatuses?: number[];
  secretValues?: readonly string[];
  timeoutMs?: number;
}): Promise<ApiResult> {
  const method = input.method ?? "GET";
  const secretValues = uniqueSecrets(input.token, input.secretValues);
  const controller = new AbortController();
  const timeoutMs = normalizeTimeout(input.timeoutMs);
  const state: { response: Response | null } = { response: null };
  let phase: "request" | "response_body" = "request";
  let didTimeout = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const operation = async () => {
    state.response = await input.fetchImpl(`${input.baseUrl}${input.path}`, {
      method,
      headers: {
        authorization: `Bearer ${input.token}`,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      signal: controller.signal,
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });
    phase = "response_body";
    return await state.response.text();
  };

  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        didTimeout = true;
        controller.abort();
        reject(new SmokeDeadlineExceeded());
      }, timeoutMs);
    });
    const rawBody = await Promise.race([operation(), deadline]);
    const response = state.response;
    if (!response) {
      throw new BrandingAddonSmokeFailure(
        `${method} ${input.path} response was not captured`,
        "BRANDING_ADDON_SMOKE_RESPONSE_INVALID",
        0,
        null,
        { method, path: input.path, phase },
      );
    }
    return parseApiResult({
      name: input.name,
      method,
      path: input.path,
      response,
      rawBody,
      expectedStatuses: input.expectedStatuses ?? [200],
      secretValues,
    });
  } catch (error) {
    if (didTimeout || error instanceof SmokeDeadlineExceeded) {
      throw requestTimeoutFailure(method, input.path, phase, state.response);
    }
    if (error instanceof BrandingAddonSmokeFailure) throw error;
    const response = state.response;
    if (response) {
      const requestId = readHeaderRequestId(response.headers);
      throw new BrandingAddonSmokeFailure(
        `${method} ${input.path} response body read failed`,
        "BRANDING_ADDON_SMOKE_RESPONSE_BODY_ERROR",
        response.status,
        requestId,
        { method, path: input.path, phase: "response_body" },
      );
    }
    throw new BrandingAddonSmokeFailure(
      `${method} ${input.path} network request failed`,
      "BRANDING_ADDON_SMOKE_NETWORK_ERROR",
      0,
      null,
      { method, path: input.path, phase: "request" },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseApiResult(input: {
  name: string;
  method: string;
  path: string;
  response: Response;
  rawBody: string;
  expectedStatuses: number[];
  secretValues: readonly string[];
}): ApiResult {
  const requestIdFromHeader = readHeaderRequestId(input.response.headers);
  const isOversized = input.rawBody.length > MAX_RESPONSE_BODY_CHARS;
  let rawPayload: unknown;
  let didParseJson = false;
  if (!isOversized) {
    try {
      rawPayload = JSON.parse(input.rawBody) as unknown;
      didParseJson = true;
    } catch {
      rawPayload = null;
    }
  }
  if (!isRecord(rawPayload)) {
    throw new BrandingAddonSmokeFailure(
      `${input.method} ${input.path} returned an invalid JSON response`,
      input.expectedStatuses.includes(input.response.status)
        ? "BRANDING_ADDON_SMOKE_RESPONSE_INVALID"
        : "BRANDING_ADDON_SMOKE_HTTP_ERROR",
      input.response.status,
      requestIdFromHeader,
      buildBodyFingerprint(
        input.rawBody,
        isOversized
          ? "RESPONSE_BODY_TOO_LARGE"
          : didParseJson
          ? "INVALID_RESPONSE_ENVELOPE"
          : "NON_JSON_RESPONSE",
      ),
    );
  }

  const payload = rawPayload;
  const code = readString(payload.code);
  const requestId = readString(payload.requestId) ?? requestIdFromHeader;
  const evidence: SmokeEvidence = {
    name: input.name,
    method: input.method,
    path: input.path,
    http_status: input.response.status,
    code,
    request_id: requestId,
    response: redactBrandingAddonSmokeValue(payload, input.secretValues),
  };
  if (!input.expectedStatuses.includes(input.response.status)) {
    throw new BrandingAddonSmokeFailure(
      `${input.method} ${input.path} returned HTTP ${input.response.status}`,
      code ?? "BRANDING_ADDON_SMOKE_HTTP_ERROR",
      input.response.status,
      requestId,
      evidence.response,
    );
  }
  if (!isRecord(payload.data) && input.response.status === 200) {
    throw new BrandingAddonSmokeFailure(
      `${input.method} ${input.path} response data envelope is invalid`,
      "BRANDING_ADDON_SMOKE_RESPONSE_INVALID",
      input.response.status,
      requestId,
      buildBodyFingerprint(
        input.rawBody,
        "INVALID_RESPONSE_ENVELOPE",
      ),
    );
  }
  return {
    payload,
    data: isRecord(payload.data) ? payload.data : {},
    evidence,
  };
}

class SmokeDeadlineExceeded extends Error {}

function requestTimeoutFailure(
  method: string,
  path: string,
  phase: "request" | "response_body",
  response: Response | null,
) {
  return new BrandingAddonSmokeFailure(
    `${method} ${path} exceeded the total response deadline`,
    "BRANDING_ADDON_SMOKE_TIMEOUT",
    response?.status ?? 0,
    response ? readHeaderRequestId(response.headers) : null,
    { method, path, phase },
  );
}

function buildBodyFingerprint(
  rawBody: string,
  summary:
    | "NON_JSON_RESPONSE"
    | "RESPONSE_BODY_TOO_LARGE"
    | "INVALID_RESPONSE_ENVELOPE",
) {
  return {
    summary,
    body_length: new TextEncoder().encode(rawBody).byteLength,
    body_sha256: createHash("sha256").update(rawBody).digest("hex"),
  };
}

function readHeaderRequestId(headers: Headers): string | null {
  return readString(
    headers.get("x-request-id") ??
      headers.get("request-id") ??
      headers.get("x-requestid"),
  );
}

function uniqueSecrets(
  token: string,
  secretValues: readonly string[] | undefined,
): string[] {
  return [...new Set([token, ...(secretValues ?? [])].filter(Boolean))];
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  return Number.isFinite(timeoutMs) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : DEFAULT_HTTP_TIMEOUT_MS;
}

export function contractFailure(message: string) {
  return new BrandingAddonSmokeFailure(
    message,
    "BRANDING_ADDON_SMOKE_CONTRACT_INVALID",
    0,
    null,
    null,
  );
}

export function withContractEvidence<T>(
  evidence: SmokeEvidence,
  validate: () => T,
): T {
  try {
    return validate();
  } catch (error) {
    if (!(error instanceof BrandingAddonSmokeFailure)) throw error;
    return throwFailureWithEvidence(error, evidence);
  }
}

function throwFailureWithEvidence(
  failure: BrandingAddonSmokeFailure,
  evidence: SmokeEvidence,
): never {
  throw new BrandingAddonSmokeFailure(
    failure.message,
    failure.code,
    evidence.http_status,
    evidence.request_id,
    evidence.response,
  );
}

export function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw contractFailure(`${label} must be an object`);
  return value;
}

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function trimOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  return trimOptional(value)?.replace(/\/+$/, "");
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function stripUrlQuery(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return REDACTED;
  }
}
