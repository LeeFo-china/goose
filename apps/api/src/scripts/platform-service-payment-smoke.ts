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
type SmokeMode = "dry_run" | "order_lookup";

export type PlatformServicePaymentSmokeConfig = {
  baseUrl: string;
  tenantToken: string;
  platformToken: string;
  mode: SmokeMode;
  orderId: string | null;
};

type ApiEnvironment = {
  base_url: string;
  host: string;
};

type ProductSummary = {
  code: string;
  title: string;
  term_years: number;
  amount_fen: number;
  list_amount_fen: number;
  pricing_version: number;
  terms_version: number;
};

type OrderSummary = {
  id: string;
  order_no: string;
  product_code: string;
  amount_fen: number;
  payment_status: string;
  service_status: string;
  display_stage: string | null;
  version: number;
};

type SmokeReadiness = {
  tenant_products: boolean;
  tenant_order_list: boolean;
  platform_products: boolean;
  create_order_schema_probe: boolean;
};

type BaseSmokeResult = {
  ok: true;
  mode: SmokeMode;
  api_environment: ApiEnvironment;
  readiness: SmokeReadiness;
  products: ProductSummary[];
  order: OrderSummary | null;
  request_ids: string[];
  payment_attempted: false;
  order_created: false;
};

const REQUIRED_PRODUCT_CODES = [
  "platform_service_1y",
  "platform_service_2y",
  "platform_service_3y",
] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePlatformServicePaymentSmokeConfig(
  env: EnvLike = process.env,
  args: string[] = process.argv.slice(2),
): { ok: true; config: PlatformServicePaymentSmokeConfig } |
  { ok: false; errors: string[] } {
  const errors: string[] = [];
  const primaryBaseUrl = normalizeBaseUrl(env.API_BASE_URL);
  const legacyBaseUrl = normalizeBaseUrl(env.GOOES_API_BASE_URL);
  const baseUrl = primaryBaseUrl ?? legacyBaseUrl;
  const tenantToken = trimmed(env.PLATFORM_SERVICE_SMOKE_TENANT_TOKEN);
  const platformToken = trimmed(env.PLATFORM_SERVICE_SMOKE_PLATFORM_TOKEN);
  const orderId = parseOrderId(args);
  const hasDryRun = args.includes("--dry-run");
  const hasUnknownArg = args.some((arg, index) =>
    arg !== "--dry-run" && arg !== "--order-id" &&
    args[index - 1] !== "--order-id"
  );

  if (!baseUrl) errors.push("API_BASE_URL is required");
  if (
    primaryBaseUrl && legacyBaseUrl && primaryBaseUrl !== legacyBaseUrl
  ) {
    errors.push("API_BASE_URL and GOOES_API_BASE_URL must match when both are set");
  }
  if (baseUrl && !isHttpUrl(baseUrl)) {
    errors.push("API_BASE_URL must be an absolute HTTP(S) URL");
  }
  if (baseUrl && /^http:\/\//i.test(baseUrl) && !isLoopbackUrl(baseUrl)) {
    errors.push("API_BASE_URL must use HTTPS unless it targets loopback");
  }
  if (!tenantToken) {
    errors.push("PLATFORM_SERVICE_SMOKE_TENANT_TOKEN is required");
  }
  if (!platformToken) {
    errors.push("PLATFORM_SERVICE_SMOKE_PLATFORM_TOKEN is required");
  }
  if (tenantToken && platformToken && tenantToken === platformToken) {
    errors.push("tenant and platform smoke tokens must differ");
  }
  if (args.includes("--order-id") && !orderId) {
    errors.push("--order-id must be a UUID");
  }
  if (hasDryRun && orderId) {
    errors.push("--dry-run and --order-id cannot be used together");
  }
  if (hasUnknownArg) {
    errors.push("only --dry-run and --order-id are supported");
  }
  if (errors.length > 0 || !baseUrl || !tenantToken || !platformToken) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      baseUrl,
      tenantToken,
      platformToken,
      mode: orderId ? "order_lookup" : "dry_run",
      orderId,
    },
  };
}

export async function runPlatformServicePaymentSmoke(input: {
  config: PlatformServicePaymentSmokeConfig;
  fetchImpl?: FetchLike;
}): Promise<BaseSmokeResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const checks: ApiResult[] = [];
  const request = (
    name: string,
    path: string,
    token: string,
    options: {
      method?: "GET" | "POST";
      body?: Record<string, unknown>;
      expectedStatuses?: number[];
    } = {},
  ) =>
    requestBrandingAddonSmokeJson({
      name,
      baseUrl: input.config.baseUrl,
      path,
      token,
      fetchImpl,
      secretValues: [input.config.tenantToken, input.config.platformToken],
      ...options,
    });

  if (input.config.mode === "order_lookup") {
    const orderId = input.config.orderId;
    if (!orderId) {
      throw smokeFailure(
        "PLATFORM_SERVICE_SMOKE_ORDER_ID_REQUIRED",
        "order lookup mode requires --order-id",
      );
    }
    const orderResult = await request(
      "tenant service order lookup",
      `/billing/service-orders/${orderId}`,
      input.config.tenantToken,
    );
    checks.push(orderResult);
    return {
      ok: true,
      mode: "order_lookup",
      api_environment: getApiEnvironment(input.config.baseUrl),
      readiness: emptyReadiness(),
      products: [],
      order: withContractEvidence(orderResult.evidence, () =>
        readOrderSummary(orderResult.data.order)),
      request_ids: collectRequestIds(checks),
      payment_attempted: false,
      order_created: false,
    };
  }

  const tenantProducts = await request(
    "tenant service products",
    "/billing/service-products?page=1&pageSize=20",
    input.config.tenantToken,
  );
  checks.push(tenantProducts);
  const products = withContractEvidence(tenantProducts.evidence, () =>
    readRequiredProducts(tenantProducts.data));

  const tenantOrders = await request(
    "tenant service order list",
    "/billing/service-orders?page=1&pageSize=20",
    input.config.tenantToken,
  );
  checks.push(tenantOrders);
  withContractEvidence(tenantOrders.evidence, () =>
    assertPaginatedList(tenantOrders.data, "tenant service order list"));

  const platformProducts = await request(
    "platform service products",
    "/platform/billing/service-products?page=1&pageSize=20",
    input.config.platformToken,
  );
  checks.push(platformProducts);
  withContractEvidence(platformProducts.evidence, () =>
    assertPaginatedList(platformProducts.data, "platform service products"));

  const createOrderProbe = await request(
    "tenant service order schema probe",
    "/billing/service-orders",
    input.config.tenantToken,
    { method: "POST", body: {}, expectedStatuses: [400, 401] },
  );
  checks.push(createOrderProbe);
  withContractEvidence(createOrderProbe.evidence, () => {
    if (
      createOrderProbe.evidence.code !== "VALIDATION_ERROR" &&
      createOrderProbe.evidence.code !== "PAYER_OPENID_REQUIRED"
    ) {
      throw contractFailure(
        "create order probe must validate schema or payer openid before writes",
      );
    }
  });

  return {
    ok: true,
    mode: "dry_run",
    api_environment: getApiEnvironment(input.config.baseUrl),
    readiness: {
      tenant_products: true,
      tenant_order_list: true,
      platform_products: true,
      create_order_schema_probe: true,
    },
    products,
    order: null,
    request_ids: collectRequestIds(checks),
    payment_attempted: false,
    order_created: false,
  };
}

export type PlatformServicePaymentSmokeResult =
  Awaited<ReturnType<typeof runPlatformServicePaymentSmoke>>;

export function toPlatformServicePaymentSmokeLog(
  result: PlatformServicePaymentSmokeResult,
) {
  return {
    ok: result.ok,
    mode: result.mode,
    api_environment: result.api_environment,
    readiness: result.readiness,
    products: result.products,
    order: result.order,
    request_ids: result.request_ids,
    payment_attempted: result.payment_attempted,
    order_created: result.order_created,
  };
}

function readRequiredProducts(data: Record<string, unknown>): ProductSummary[] {
  assertPaginatedList(data, "tenant service products");
  const list = data.list as unknown[];
  const products = list.map(readProductSummary);
  const productCodes = new Set(products.map((product) => product.code));
  for (const code of REQUIRED_PRODUCT_CODES) {
    if (!productCodes.has(code)) {
      throw contractFailure(`required platform service product is missing: ${code}`);
    }
  }
  return REQUIRED_PRODUCT_CODES.map((code) => {
    const product = products.find((item) => item.code === code);
    if (!product) {
      throw contractFailure(`required platform service product is missing: ${code}`);
    }
    return product;
  });
}

function readProductSummary(value: unknown): ProductSummary {
  const product = requireRecord(value, "platform service product");
  return {
    code: requireString(product.code, "product code"),
    title: requireString(product.title, "product title"),
    term_years: requireSafeInteger(product.term_years, "product term_years"),
    amount_fen: requireSafeInteger(product.amount_fen, "product amount_fen"),
    list_amount_fen: requireSafeInteger(
      product.list_amount_fen,
      "product list_amount_fen",
    ),
    pricing_version: requireSafeInteger(
      product.pricing_version,
      "product pricing_version",
    ),
    terms_version: requireSafeInteger(
      product.terms_version,
      "product terms_version",
    ),
  };
}

function readOrderSummary(value: unknown): OrderSummary {
  const order = requireRecord(value, "platform service order");
  return {
    id: requireString(order.id, "order id"),
    order_no: requireString(order.order_no, "order no"),
    product_code: requireString(order.product_code, "order product_code"),
    amount_fen: requireSafeInteger(order.amount_fen, "order amount_fen"),
    payment_status: requireString(order.payment_status, "order payment_status"),
    service_status: requireString(order.service_status, "order service_status"),
    display_stage: readString(order.display_stage),
    version: requireSafeInteger(order.version, "order version"),
  };
}

function assertPaginatedList(data: Record<string, unknown>, label: string): void {
  if (!Array.isArray(data.list)) {
    throw contractFailure(`${label} must return a list array`);
  }
  const pagination = requireRecord(data.pagination, `${label} pagination`);
  if (pagination.page !== 1 || pagination.pageSize !== 20) {
    throw contractFailure(`${label} pagination page or pageSize is invalid`);
  }
  const total = pagination.total;
  const totalPages = pagination.totalPages;
  if (
    !Number.isSafeInteger(total) || Number(total) < 0 ||
    !Number.isSafeInteger(totalPages) || Number(totalPages) < 0
  ) {
    throw contractFailure(`${label} pagination totals are invalid`);
  }
}

function collectRequestIds(results: ApiResult[]): string[] {
  return results
    .map((result) => result.evidence.request_id)
    .filter((requestId): requestId is string => requestId !== null);
}

function emptyReadiness(): SmokeReadiness {
  return {
    tenant_products: false,
    tenant_order_list: false,
    platform_products: false,
    create_order_schema_probe: false,
  };
}

function getApiEnvironment(baseUrl: string): ApiEnvironment {
  const parsed = new URL(baseUrl);
  return {
    base_url: `${parsed.protocol}//${parsed.host}`,
    host: parsed.host,
  };
}

function smokeFailure(code: string, message: string): BrandingAddonSmokeFailure {
  return new BrandingAddonSmokeFailure(message, code, 0, null, null);
}

function requireString(value: unknown, label: string): string {
  const text = readString(value);
  if (!text) throw contractFailure(`${label} is required`);
  return text;
}

function requireSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw contractFailure(`${label} must be a safe integer`);
  }
  return Number(value);
}

function parseOrderId(args: string[]): string | null {
  const index = args.indexOf("--order-id");
  if (index < 0) return null;
  const value = args[index + 1]?.trim();
  return value && UUID_PATTERN.test(value) ? value : null;
}

function trimmed(value: string | undefined): string | null {
  const candidate = value?.trim() ?? "";
  return candidate || null;
}

function normalizeBaseUrl(value: string | undefined): string | null {
  return trimmed(value)?.replace(/\/+$/, "") ?? null;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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

async function main(): Promise<void> {
  const parsed = parsePlatformServicePaymentSmokeConfig();
  if (!parsed.ok) {
    console.error(JSON.stringify({ ok: false, errors: parsed.errors }));
    process.exit(1);
  }

  try {
    const result = await runPlatformServicePaymentSmoke({
      config: parsed.config,
    });
    console.log(JSON.stringify(toPlatformServicePaymentSmokeLog(result), null, 2));
  } catch (error) {
    const failure = error as {
      code?: unknown;
      http_status?: unknown;
      request_id?: unknown;
    };
    console.error(JSON.stringify({
      ok: false,
      code: readString(failure.code) ?? "PLATFORM_SERVICE_SMOKE_FAILED",
      http_status: typeof failure.http_status === "number"
        ? failure.http_status
        : 0,
      request_id: readString(failure.request_id),
      payment_attempted: false,
      order_created: false,
    }));
    process.exit(1);
  }
}

if (import.meta.main) void main();
