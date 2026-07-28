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
  const rawBaseUrl = trimOptional(env.GOOES_API_BASE_URL);
  const baseUrl = rawBaseUrl?.replace(/\/+$/, "");
  const adminToken = trimOptional(env.BRANDING_ADDON_SMOKE_ADMIN_TOKEN);
  const isolationToken = trimOptional(
    env.BRANDING_ADDON_SMOKE_ISOLATION_TOKEN,
  );
  const platformToken = trimOptional(
    env.BRANDING_ADDON_SMOKE_PLATFORM_TOKEN,
  ) ?? null;

  if (!baseUrl) errors.push("GOOES_API_BASE_URL is required");
  if (!adminToken) {
    errors.push("BRANDING_ADDON_SMOKE_ADMIN_TOKEN is required");
  }
  if (!isolationToken) {
    errors.push("BRANDING_ADDON_SMOKE_ISOLATION_TOKEN is required");
  }
  if (baseUrl && !isHttpUrl(baseUrl)) {
    errors.push("GOOES_API_BASE_URL must be an absolute HTTP(S) URL");
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
  return redactValue(value, "", secretValues.filter(Boolean));
}

function redactValue(
  value: unknown,
  key: string,
  secretValues: readonly string[],
): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return REDACTED;
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, "", secretValues));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactValue(childValue, childKey, secretValues),
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
}): Promise<ApiResult> {
  const method = input.method ?? "GET";
  let response: Response;
  try {
    response = await input.fetchImpl(`${input.baseUrl}${input.path}`, {
      method,
      headers: {
        authorization: `Bearer ${input.token}`,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });
  } catch {
    throw new BrandingAddonSmokeFailure(
      `${method} ${input.path} network request failed`,
      "BRANDING_ADDON_SMOKE_NETWORK_ERROR",
      0,
      null,
      { path: input.path },
    );
  }

  const rawPayload = await response.json().catch(() => null);
  const payload = isRecord(rawPayload) ? rawPayload : {};
  const code = readString(payload.code);
  const requestId = readString(payload.requestId);
  const evidence: SmokeEvidence = {
    name: input.name,
    method,
    path: input.path,
    http_status: response.status,
    code,
    request_id: requestId,
    response: redactBrandingAddonSmokeValue(payload, [input.token]),
  };
  if (!(input.expectedStatuses ?? [200]).includes(response.status)) {
    throw new BrandingAddonSmokeFailure(
      `${method} ${input.path} returned HTTP ${response.status}`,
      code ?? "BRANDING_ADDON_SMOKE_HTTP_ERROR",
      response.status,
      requestId,
      evidence.response,
    );
  }
  return {
    payload,
    data: isRecord(payload.data) ? payload.data : {},
    evidence,
  };
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
