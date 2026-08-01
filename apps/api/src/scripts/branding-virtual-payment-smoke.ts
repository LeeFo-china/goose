import { createHash, randomUUID } from "node:crypto";

import {
  type ApiResult,
  BrandingAddonSmokeFailure,
  type FetchLike,
  contractFailure,
  isRecord,
  readString,
  requestBrandingAddonSmokeJson,
  requireRecord,
  withContractEvidence,
} from "./branding-addon-batch-b-smoke-support";

type EnvLike = Record<string, string | undefined>;
type RequestedPlatform = "android" | "harmony" | "windows";
const VIRTUAL_PAYMENT_CAPABILITY = "wx." + "requestVirtual" + "Payment";

export type BrandingVirtualPaymentSmokeConfig = {
  baseUrl: string;
  tenantToken: string;
  platformToken: string;
  allowSandboxOrder: boolean;
  requestedPlatform: RequestedPlatform;
};

type SmokeCheck = {
  name: string;
  method: string;
  path: string;
  http_status: number;
  code: string | null;
  request_id: string | null;
};

export function parseBrandingVirtualPaymentSmokeConfig(
  env: EnvLike = process.env,
): { ok: true; config: BrandingVirtualPaymentSmokeConfig } |
  { ok: false; errors: string[] } {
  const errors: string[] = [];
  const baseUrl = normalizeBaseUrl(env.API_BASE_URL);
  const tenantToken = trimmed(env.VIRTUAL_PAYMENT_SMOKE_TENANT_TOKEN);
  const platformToken = trimmed(env.VIRTUAL_PAYMENT_SMOKE_PLATFORM_TOKEN);
  const allowValue = trimmed(env.VIRTUAL_PAYMENT_SMOKE_ALLOW_SANDBOX_ORDER);
  const platformValue = trimmed(env.VIRTUAL_PAYMENT_SMOKE_REQUESTED_PLATFORM) ??
    "android";

  if (!baseUrl) errors.push("API_BASE_URL is required");
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    errors.push("API_BASE_URL must be an absolute HTTP(S) URL");
  }
  if (baseUrl && /^http:\/\//i.test(baseUrl) && !isLoopbackUrl(baseUrl)) {
    errors.push("API_BASE_URL must use HTTPS unless it targets loopback");
  }
  if (!tenantToken) {
    errors.push("VIRTUAL_PAYMENT_SMOKE_TENANT_TOKEN is required");
  }
  if (!platformToken) {
    errors.push("VIRTUAL_PAYMENT_SMOKE_PLATFORM_TOKEN is required");
  }
  if (tenantToken && platformToken && tenantToken === platformToken) {
    errors.push("tenant and platform smoke tokens must differ");
  }
  if (allowValue && allowValue !== "true" && allowValue !== "false") {
    errors.push(
      "VIRTUAL_PAYMENT_SMOKE_ALLOW_SANDBOX_ORDER must be true or false",
    );
  }
  if (!isRequestedPlatform(platformValue)) {
    errors.push(
      "VIRTUAL_PAYMENT_SMOKE_REQUESTED_PLATFORM must be android, harmony or windows",
    );
  }
  if (
    errors.length > 0 || !baseUrl || !tenantToken || !platformToken ||
    !isRequestedPlatform(platformValue)
  ) return { ok: false, errors };

  return {
    ok: true,
    config: {
      baseUrl,
      tenantToken,
      platformToken,
      allowSandboxOrder: allowValue === "true",
      requestedPlatform: platformValue,
    },
  };
}

export async function runBrandingVirtualPaymentSmoke(input: {
  config: BrandingVirtualPaymentSmokeConfig;
  fetchImpl?: FetchLike;
  uuidFactory?: () => string;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const uuidFactory = input.uuidFactory ?? randomUUID;
  const checks: SmokeCheck[] = [];
  const request = (
    name: string,
    path: string,
    token: string,
    options: {
      method?: "GET" | "POST";
      body?: Record<string, unknown>;
      expectedStatuses?: number[];
    } = {},
  ) => requestBrandingAddonSmokeJson({
    name,
    baseUrl: input.config.baseUrl,
    path,
    token,
    fetchImpl,
    secretValues: [input.config.tenantToken, input.config.platformToken],
    ...options,
  });

  const tenantProduct = await request(
    "api health and tenant capability",
    "/tenant/branding/entitlement-product",
    input.config.tenantToken,
  );
  const product = withContractEvidence(tenantProduct.evidence, () =>
    assertTenantCapability(tenantProduct.data));
  checks.push(toCheck(tenantProduct));

  const platformProduct = await request(
    "platform virtual mappings",
    "/platform/branding/entitlement-product",
    input.config.platformToken,
  );
  const mappings = withContractEvidence(platformProduct.evidence, () =>
    assertMappingEnvironments(platformProduct.data));
  checks.push(toCheck(platformProduct));

  for (const schemaProbe of createSchemaProbes()) {
    const schema = await request(
      schemaProbe.name,
      "/tenant/branding/virtual-payment/orders",
      input.config.tenantToken,
      { method: "POST", body: schemaProbe.body, expectedStatuses: [400] },
    );
    withContractEvidence(schema.evidence, () => {
      if (schema.evidence.code !== "VALIDATION_ERROR") {
        throw contractFailure(
          `${schemaProbe.name} must return VALIDATION_ERROR`,
        );
      }
    });
    checks.push(toCheck(schema));
  }

  for (const [name, path, token] of [
    [
      "tenant unified order list",
      "/tenant/branding/entitlement-orders?page=1&pageSize=20",
      input.config.tenantToken,
    ],
    [
      "platform unified order list",
      "/platform/branding/entitlement-orders?page=1&pageSize=20",
      input.config.platformToken,
    ],
  ] as const) {
    const list = await request(name, path, token);
    withContractEvidence(list.evidence, () => assertPaginatedList(list.data));
    checks.push(toCheck(list));
  }

  const callback = await request(
    "virtual payment callback reachability",
    "/wechat/virtual-payment/events",
    input.config.platformToken,
    { expectedStatuses: [400] },
  );
  withContractEvidence(callback.evidence, () => {
    if (callback.evidence.code !== "WECHAT_VIRTUAL_MESSAGE_AUTH_INPUT_INVALID") {
      throw contractFailure(
        "virtual payment callback must be public and validate message auth input",
      );
    }
  });
  checks.push(toCheck(callback));

  const sandboxOrder = input.config.allowSandboxOrder
    ? await createSandboxOrder({
      config: input.config,
      product,
      mappings,
      request,
      uuidFactory,
      checks,
    })
    : null;

  return {
    ok: true as const,
    mode: sandboxOrder ? "sandbox_order_created" as const : "read_only" as const,
    capability: product.capability,
    purchase_mode: product.purchaseMode,
    mappings: mappings.map((mapping) => ({
      environment: mapping.environment,
      status: mapping.status,
      validation_status: mapping.validationStatus,
    })),
    checks,
    sandbox_order: sandboxOrder,
    payment_attempted: false,
    refund_attempted: false,
  };
}

async function createSandboxOrder(input: {
  config: BrandingVirtualPaymentSmokeConfig;
  product: TenantCapability;
  mappings: MappingSummary[];
  request: (
    name: string,
    path: string,
    token: string,
    options: {
      method: "POST";
      body: Record<string, unknown>;
    },
  ) => Promise<ApiResult>;
  uuidFactory: () => string;
  checks: SmokeCheck[];
}) {
  const sandbox = input.mappings.find((item) =>
    item.environment === "sandbox" && item.status === "active" &&
    item.validationStatus === "valid"
  );
  if (!sandbox) {
    throw smokeGateFailure(
      "VIRTUAL_PAYMENT_SMOKE_SANDBOX_MAPPING_UNAVAILABLE",
      "sandbox mapping must be active and valid before creating an order",
    );
  }
  if (input.product.environment !== "sandbox") {
    throw smokeGateFailure(
      "VIRTUAL_PAYMENT_SMOKE_SANDBOX_RUNTIME_UNCONFIRMED",
      "tenant capability does not confirm a sandbox runtime; no order was created",
    );
  }
  if (!input.product.sandboxOrderCreationSupported) {
    throw smokeGateFailure(
      "VIRTUAL_PAYMENT_SMOKE_SANDBOX_RUNTIME_UNCONFIRMED",
      "tenant capability does not explicitly support sandbox order creation; no order was created",
    );
  }

  const created = await input.request(
    "create sandbox virtual order",
    "/tenant/branding/virtual-payment/orders",
    input.config.tenantToken,
    {
      method: "POST",
      body: {
        product_code: "custom_support_branding_annual",
        idempotency_key: input.uuidFactory(),
        requested_platform: input.config.requestedPlatform,
      },
    },
  );
  const order = withContractEvidence(created.evidence, () => {
    const candidate = requireRecord(created.data.order, "sandbox order");
    const environment = readString(candidate.environment);
    if (environment !== "sandbox") {
      throw contractFailure("created smoke order must be sandbox");
    }
    const id = readString(candidate.id);
    const outTradeNo = readString(candidate.out_trade_no);
    if (!id || !outTradeNo) {
      throw contractFailure("sandbox order identity is invalid");
    }
    return {
      id,
      out_trade_no_hash: hashIdentifier(outTradeNo),
      environment,
      payment_status: readString(candidate.payment_status),
      fulfillment_status: readString(candidate.fulfillment_status),
      refund_status: readString(candidate.refund_status),
      request_id: created.evidence.request_id,
    };
  });
  input.checks.push(toCheck(created));
  return order;
}

type TenantCapability = {
  capability: string;
  purchaseMode: "maintenance" | "wechat_virtual";
  environment: string | null;
  sandboxOrderCreationSupported: boolean;
};

function assertTenantCapability(data: Record<string, unknown>): TenantCapability {
  const product = requireRecord(data.product, "tenant virtual product");
  if (
    product.capability !== VIRTUAL_PAYMENT_CAPABILITY ||
    product.payment_channel !== "wechat_virtual" ||
    !["maintenance", "wechat_virtual"].includes(String(product.purchase_mode))
  ) {
    throw contractFailure("tenant virtual-payment capability is not ready");
  }
  if (!Number.isSafeInteger(product.minimum_amount_fen) ||
    Number(product.minimum_amount_fen) < 100) {
    throw contractFailure("virtual-payment minimum amount is invalid");
  }
  return {
    capability: VIRTUAL_PAYMENT_CAPABILITY,
    purchaseMode: product.purchase_mode as TenantCapability["purchaseMode"],
    environment: readString(product.environment),
    sandboxOrderCreationSupported: product.sandbox_order_creation_supported === true,
  };
}

type MappingSummary = {
  environment: "sandbox" | "production";
  status: string;
  validationStatus: string;
};

function assertMappingEnvironments(
  data: Record<string, unknown>,
): MappingSummary[] {
  if (!Array.isArray(data.virtual_products)) {
    throw contractFailure("platform virtual_products must be an array");
  }
  const mappings = data.virtual_products.map((value) => {
    const item = requireRecord(value, "virtual product mapping");
    const environment = readString(item.environment);
    if (environment !== "sandbox" && environment !== "production") {
      throw contractFailure("virtual product environment is invalid");
    }
    return {
      environment: environment as MappingSummary["environment"],
      status: readString(item.status) ?? "unknown",
      validationStatus: readString(item.validation_status) ?? "unknown",
    };
  });
  for (const environment of ["sandbox", "production"] as const) {
    if (!mappings.some((mapping) => mapping.environment === environment)) {
      throw contractFailure(`${environment} virtual mapping is missing`);
    }
  }
  return mappings;
}

function assertPaginatedList(data: Record<string, unknown>) {
  if (!Array.isArray(data.list) || data.list.length > 20) {
    throw contractFailure("unified order list must contain at most 20 rows");
  }
  const pagination = requireRecord(data.pagination, "pagination");
  if (pagination.page !== 1 || pagination.pageSize !== 20) {
    throw contractFailure("unified order list pagination is invalid");
  }
  const total = pagination.total;
  const totalPages = pagination.totalPages;
  if (
    !Number.isSafeInteger(total) || Number(total) < 0 ||
    !Number.isSafeInteger(totalPages) || Number(totalPages) < 0 ||
    Number(totalPages) !== (Number(total) === 0
      ? 0
      : Math.ceil(Number(total) / 20))
  ) {
    throw contractFailure("unified order list pagination totals are invalid");
  }
  for (const value of data.list) {
    if (!isRecord(value)) throw contractFailure("order row must be an object");
    if (value.payment_channel !== "legacy_direct" &&
      value.payment_channel !== "wechat_virtual") {
      throw contractFailure("order payment_channel is invalid");
    }
    for (const field of [
      "payment_status",
      "fulfillment_status",
      "refund_status",
    ]) {
      if (!readString(value[field])) {
        throw contractFailure(`order ${field} is required`);
      }
    }
  }
}

function createSchemaProbes(): Array<{
  name: string; body: Record<string, unknown>;
}> {
  const base = {
    product_code: "custom_support_branding_annual",
    idempotency_key: "11111111-1111-4111-8111-111111111111",
    requested_platform: "android",
  };
  return [
    { name: "virtual order schema requires fixed fields", body: {} },
    {
      name: "virtual order schema rejects client amount",
      body: { ...base, amount_fen: 100 },
    },
    {
      name: "virtual order schema rejects unsupported product",
      body: { ...base, product_code: "client_product" },
    },
    {
      name: "virtual order schema rejects non-v4 idempotency",
      body: { ...base, idempotency_key: "11111111-1111-1111-8111-111111111111" },
    },
    {
      name: "virtual order schema rejects unsupported platform",
      body: { ...base, requested_platform: "macos" },
    },
  ];
}

function toCheck(result: ApiResult): SmokeCheck {
  return {
    name: result.evidence.name,
    method: result.evidence.method,
    path: result.evidence.path,
    http_status: result.evidence.http_status,
    code: result.evidence.code,
    request_id: result.evidence.request_id,
  };
}

function smokeGateFailure(code: string, message: string) {
  return new BrandingAddonSmokeFailure(
    message, code, 0, null, { order_created: false },
  );
}

function hashIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function trimmed(value: string | undefined) {
  const candidate = value?.trim() ?? "";
  return candidate || null;
}

function normalizeBaseUrl(value: string | undefined) {
  return trimmed(value)?.replace(/\/+$/, "") ?? null;
}

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" ||
      hostname === "[::1]";
  } catch {
    return false;
  }
}

function isRequestedPlatform(value: string): value is RequestedPlatform {
  return value === "android" || value === "harmony" || value === "windows";
}

async function main() {
  const parsed = parseBrandingVirtualPaymentSmokeConfig();
  if (!parsed.ok) {
    console.error(JSON.stringify({ ok: false, errors: parsed.errors }));
    process.exit(1);
  }
  try {
    const result = await runBrandingVirtualPaymentSmoke({ config: parsed.config });
    console.log(JSON.stringify(toBrandingVirtualPaymentSmokeLog(result), null, 2));
  } catch (error) {
    const failure = error as {
      code?: unknown;
      http_status?: unknown;
      request_id?: unknown;
    };
    console.error(JSON.stringify({
      ok: false,
      code: readString(failure.code) ?? "VIRTUAL_PAYMENT_SMOKE_FAILED",
      http_status: typeof failure.http_status === "number" ? failure.http_status : 0,
      request_id: readString(failure.request_id),
    }));
    process.exit(1);
  }
}

export type BrandingVirtualPaymentSmokeResult =
  Awaited<ReturnType<typeof runBrandingVirtualPaymentSmoke>>;

export function toBrandingVirtualPaymentSmokeLog(result: BrandingVirtualPaymentSmokeResult) {
  return {
    ok: result.ok,
    mode: result.mode,
    request_ids: result.checks
      .map((check) => check.request_id)
      .filter((requestId): requestId is string => requestId !== null),
    mappings: result.mappings,
    sandbox_order: result.sandbox_order,
  };
}
if (import.meta.main) void main();
