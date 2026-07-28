import {
  type ApiResult,
  type BrandingAddonBatchBSmokeConfig,
  BrandingAddonSmokeFailure,
  type FetchLike,
  type SmokeEvidence,
  contractFailure,
  isRecord,
  parseBrandingAddonBatchBSmokeConfig,
  readString,
  redactBrandingAddonSmokeValue,
  requestBrandingAddonSmokeJson,
  requireRecord,
} from "./branding-addon-batch-b-smoke-support";

export {
  parseBrandingAddonBatchBSmokeConfig,
  redactBrandingAddonSmokeValue,
} from "./branding-addon-batch-b-smoke-support";

type RunSmokeInput = {
  config: BrandingAddonBatchBSmokeConfig;
  fetchImpl?: FetchLike;
  uuidFactory?: () => string;
};

const PRODUCT_CODE = "custom_support_branding_annual";
const MAX_PAGE_SIZE = 100;

export function assertExpectedEffectiveBranding(
  data: Record<string, unknown>,
  expectedSource: "tenant" | "platform",
): void {
  if (data.source !== expectedSource) {
    throw contractFailure(
      `effective branding source must be ${expectedSource}`,
    );
  }
  if (
    !readString(data.display_name) ||
    !readString(data.logo_url) ||
    data.support_text !== data.display_name ||
    !Number.isInteger(data.version)
  ) {
    throw contractFailure("Batch A effective branding contract is invalid");
  }
}

export async function runBrandingAddonBatchBSmoke(
  input: RunSmokeInput,
) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const uuidFactory = input.uuidFactory ?? crypto.randomUUID;
  const checks: SmokeEvidence[] = [];
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
      ...options,
    });

  let adminProduct: ApiResult;
  try {
    adminProduct = await request(
      "tenant product (admin)",
      "/tenant/branding/entitlement-product",
      input.config.adminToken,
    );
  } catch (error) {
    throw productPreconditionFailure(error);
  }
  assertPurchasableProduct(adminProduct.data);
  checks.push(adminProduct.evidence);

  const isolationProduct = await request(
    "tenant product (isolation)",
    "/tenant/branding/entitlement-product",
    input.config.isolationToken,
  );
  assertPurchasableProduct(isolationProduct.data);
  checks.push(isolationProduct.evidence);

  for (
    const [name, token, expectedSource] of [
      ["batch A effective (admin)", input.config.adminToken, "tenant"],
      [
        "batch A effective (isolation)",
        input.config.isolationToken,
        "platform",
      ],
    ] as const
  ) {
    const result = await request(name, "/branding/effective", token);
    assertExpectedEffectiveBranding(result.data, expectedSource);
    checks.push(result.evidence);
  }

  const idempotencyKey = uuidFactory();
  const createBody = {
    product_code: PRODUCT_CODE,
    idempotency_key: idempotencyKey,
  };
  const created = await request(
    "create pending order",
    "/tenant/branding/entitlement-orders",
    input.config.adminToken,
    { method: "POST", body: createBody },
  );
  const createdOrder = assertPendingOrder(created.data);
  assertPaymentRequest(created.data);
  checks.push(created.evidence);

  const replay = await request(
    "idempotency replay",
    "/tenant/branding/entitlement-orders",
    input.config.adminToken,
    { method: "POST", body: createBody },
  );
  assertSameOrder(replay.data, createdOrder.id, "idempotency replay");
  if (replay.data.idempotent !== true) {
    throw contractFailure("idempotency replay must set idempotent=true");
  }
  checks.push(replay.evidence);

  const reused = await request(
    "reuse pending order",
    "/tenant/branding/entitlement-orders",
    input.config.adminToken,
    {
      method: "POST",
      body: {
        product_code: PRODUCT_CODE,
        idempotency_key: uuidFactory(),
      },
    },
  );
  assertSameOrder(reused.data, createdOrder.id, "pending reuse");
  if (reused.data.reused_pending !== true) {
    throw contractFailure("pending reuse must set reused_pending=true");
  }
  checks.push(reused.evidence);

  const list = await request(
    "tenant order list",
    "/tenant/branding/entitlement-orders?page=1&pageSize=20",
    input.config.adminToken,
  );
  assertPaginatedOrders(list.data, createdOrder.id);
  checks.push(list.evidence);

  const detailPath =
    `/tenant/branding/entitlement-orders/${encodeURIComponent(createdOrder.id)}`;
  const detail = await request(
    "tenant order detail",
    detailPath,
    input.config.adminToken,
  );
  assertSameOrder(detail.data, createdOrder.id, "tenant detail");
  checks.push(detail.evidence);

  const isolated = await request(
    "cross-tenant order isolation",
    detailPath,
    input.config.isolationToken,
    { expectedStatuses: [404] },
  );
  if (
    isolated.evidence.http_status !== 404 ||
    isolated.evidence.code !== "BRANDING_ADDON_ORDER_NOT_FOUND"
  ) {
    throw contractFailure(
      "cross-tenant detail must return 404 BRANDING_ADDON_ORDER_NOT_FOUND",
    );
  }
  checks.push(isolated.evidence);

  const payment = await request(
    "payment request",
    `${detailPath}/payment-request`,
    input.config.adminToken,
    { method: "POST", body: {} },
  );
  assertSameOrder(payment.data, createdOrder.id, "payment request");
  assertPaymentRequest(payment.data);
  checks.push(payment.evidence);

  if (input.config.platformToken) {
    await runPlatformChecks({
      config: input.config,
      orderId: createdOrder.id,
      request,
      checks,
    });
  }

  return {
    ok: true as const,
    mode: input.config.realPayRequested
      ? "manual_real_pay_ready" as const
      : "api_only" as const,
    order_no: createdOrder.orderNo,
    checks,
    real_payment: {
      attempted: false,
      next_step:
        "在小程序开发构建中使用同一测试租户查询订单并调用 wx.requestPayment；支付结果最终以订单和权益接口为准。",
    },
  };
}

async function runPlatformChecks(input: {
  config: BrandingAddonBatchBSmokeConfig;
  orderId: string;
  request: (
    name: string,
    path: string,
    token: string,
  ) => Promise<ApiResult>;
  checks: SmokeEvidence[];
}): Promise<void> {
  const token = input.config.platformToken;
  if (!token) return;

  const platformProduct = await input.request(
    "platform product",
    "/platform/branding/entitlement-product",
    token,
  );
  assertConfiguredPlatformProduct(platformProduct.data);
  input.checks.push(platformProduct.evidence);

  const platformList = await input.request(
    "platform order list",
    "/platform/branding/entitlement-orders?page=1&pageSize=20",
    token,
  );
  assertPaginatedOrders(platformList.data, input.orderId);
  input.checks.push(platformList.evidence);

  const platformAudit = await input.request(
    "platform order audit",
    `/platform/branding/entitlement-orders/${encodeURIComponent(input.orderId)}`,
    token,
  );
  assertSameOrder(platformAudit.data, input.orderId, "platform audit");
  input.checks.push(platformAudit.evidence);
}

function assertPurchasableProduct(data: Record<string, unknown>): void {
  const product = requireRecord(data.product, "tenant product");
  if (
    product.code !== PRODUCT_CODE ||
    !Number.isSafeInteger(product.amount_fen) ||
    Number(product.amount_fen) <= 0 ||
    product.term_years !== 1
  ) {
    throw productPreconditionFailure(contractFailure("product is not configured"));
  }
  const action = requireRecord(product.purchase_action, "purchase_action");
  if (action.enabled !== true || action.disabled_reason !== null) {
    throw productPreconditionFailure(
      contractFailure("test tenant is not allowed to purchase"),
    );
  }
}

function assertConfiguredPlatformProduct(data: Record<string, unknown>): void {
  const product = requireRecord(data.product, "platform product");
  if (
    product.code !== PRODUCT_CODE ||
    product.enabled !== true ||
    !Number.isSafeInteger(product.amount_fen) ||
    Number(product.amount_fen) <= 0 ||
    product.term_years !== 1
  ) {
    throw productPreconditionFailure(
      contractFailure("platform product is disabled or has no positive price"),
    );
  }
}

function assertPendingOrder(data: Record<string, unknown>) {
  const order = requireRecord(data.order, "created order");
  const id = readString(order.id);
  const orderNo = readString(order.order_no);
  if (
    !id ||
    !orderNo ||
    order.status !== "pending" ||
    order.product_code !== PRODUCT_CODE ||
    !Number.isSafeInteger(order.amount_fen) ||
    Number(order.amount_fen) <= 0 ||
    order.term_years !== 1
  ) {
    throw contractFailure("created order is not a valid pending order");
  }
  return { id, orderNo };
}

function assertSameOrder(
  data: Record<string, unknown>,
  expectedId: string,
  label: string,
): void {
  const order = requireRecord(data.order, `${label} order`);
  if (order.id !== expectedId) {
    throw contractFailure(`${label} returned a different order`);
  }
}

function assertPaymentRequest(data: Record<string, unknown>): void {
  const payment = requireRecord(data.payment_request, "payment_request");
  for (
    const field of ["timeStamp", "nonceStr", "package", "signType", "paySign"]
  ) {
    if (!readString(payment[field])) {
      throw contractFailure(`payment_request.${field} is required`);
    }
  }
}

function assertPaginatedOrders(
  data: Record<string, unknown>,
  expectedOrderId: string,
): void {
  const list = Array.isArray(data.list) ? data.list : null;
  const pagination = requireRecord(data.pagination, "pagination");
  if (
    !list ||
    pagination.page !== 1 ||
    pagination.pageSize !== 20 ||
    Number(pagination.pageSize) > MAX_PAGE_SIZE ||
    !list.some((item) => isRecord(item) && item.id === expectedOrderId)
  ) {
    throw contractFailure("paginated order list is invalid");
  }
}

function productPreconditionFailure(error: unknown) {
  const failure = error instanceof BrandingAddonSmokeFailure ? error : null;
  return new BrandingAddonSmokeFailure(
    "年度品牌权益商品必须已启用并配置正整数分价格，两个测试租户管理员必须具备购买权限",
    "BRANDING_ADDON_SMOKE_PRECONDITION_PRODUCT_UNAVAILABLE",
    failure?.http_status ?? 0,
    failure?.request_id ?? null,
    failure?.response ?? null,
  );
}

async function main(): Promise<number> {
  const parsed = parseBrandingAddonBatchBSmokeConfig();
  if (!parsed.ok) {
    console.error(parsed.errors.join("\n"));
    return 1;
  }
  try {
    console.log(JSON.stringify(
      await runBrandingAddonBatchBSmoke({ config: parsed.config }),
      null,
      2,
    ));
    return 0;
  } catch (error) {
    const failure = error instanceof BrandingAddonSmokeFailure
      ? error
      : contractFailure("branding addon Batch B smoke failed");
    console.error(JSON.stringify({
      ok: false,
      code: failure.code,
      http_status: failure.http_status,
      request_id: failure.request_id,
      response: redactBrandingAddonSmokeValue(failure.response),
    }, null, 2));
    return 1;
  }
}

if (import.meta.main) {
  void main().then((exitCode) => process.exit(exitCode));
}
