import {
  type ApiResult,
  type BrandingAddonBatchBSmokeConfig,
  BrandingAddonSmokeFailure,
  type FetchLike,
  type SmokeEvidence,
  contractFailure,
  parseBrandingAddonBatchBSmokeConfig,
  redactBrandingAddonSmokeValue,
  requestBrandingAddonSmokeJson,
  withContractEvidence,
} from "./branding-addon-batch-b-smoke-support";
import {
  BRANDING_ADDON_PRODUCT_CODE,
  assertConfiguredPlatformProduct,
  assertExpectedEffectiveBranding,
  assertInitialCreateOrderResult,
  assertPaginatedOrders,
  assertPaymentRequest,
  assertPurchasableProduct,
  assertRepeatedCreateOrderResult,
  assertSameOrder,
  productPreconditionFailure,
} from "./branding-addon-batch-b-smoke-contracts";

export {
  parseBrandingAddonBatchBSmokeConfig,
  redactBrandingAddonSmokeValue,
} from "./branding-addon-batch-b-smoke-support";

type RunSmokeInput = {
  config: BrandingAddonBatchBSmokeConfig;
  fetchImpl?: FetchLike;
  uuidFactory?: () => string;
};

export function sanitizeBrandingAddonSmokeOutput(
  config: BrandingAddonBatchBSmokeConfig,
  value: unknown,
): unknown {
  return redactBrandingAddonSmokeValue(value, getSmokeSecrets(config));
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
      secretValues: getSmokeSecrets(input.config),
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
  withContractEvidence(adminProduct.evidence, () =>
    assertPurchasableProduct(adminProduct.data));
  checks.push(adminProduct.evidence);

  const isolationProduct = await request(
    "tenant product (isolation)",
    "/tenant/branding/entitlement-product",
    input.config.isolationToken,
  );
  withContractEvidence(isolationProduct.evidence, () =>
    assertPurchasableProduct(isolationProduct.data));
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
    withContractEvidence(result.evidence, () =>
      assertExpectedEffectiveBranding(result.data, expectedSource));
    checks.push(result.evidence);
  }

  const idempotencyKey = uuidFactory();
  const createBody = {
    product_code: BRANDING_ADDON_PRODUCT_CODE,
    idempotency_key: idempotencyKey,
  };
  const created = await request(
    "create pending order",
    "/tenant/branding/entitlement-orders",
    input.config.adminToken,
    { method: "POST", body: createBody },
  );
  const createdOrder = withContractEvidence(created.evidence, () =>
    assertInitialCreateOrderResult(created.data));
  checks.push(created.evidence);

  const replay = await request(
    "idempotency replay",
    "/tenant/branding/entitlement-orders",
    input.config.adminToken,
    { method: "POST", body: createBody },
  );
  withContractEvidence(replay.evidence, () =>
    assertRepeatedCreateOrderResult(
      replay.data,
      createdOrder,
      "idempotency replay",
      { idempotent: true, reusedPending: false },
    ));
  checks.push(replay.evidence);

  const reused = await request(
    "reuse pending order",
    "/tenant/branding/entitlement-orders",
    input.config.adminToken,
    {
      method: "POST",
      body: {
        product_code: BRANDING_ADDON_PRODUCT_CODE,
        idempotency_key: uuidFactory(),
      },
    },
  );
  withContractEvidence(reused.evidence, () =>
    assertRepeatedCreateOrderResult(
      reused.data,
      createdOrder,
      "pending reuse",
      { idempotent: false, reusedPending: true },
    ));
  checks.push(reused.evidence);

  const list = await request(
    "tenant order list",
    "/tenant/branding/entitlement-orders?page=1&pageSize=20",
    input.config.adminToken,
  );
  withContractEvidence(list.evidence, () =>
    assertPaginatedOrders(list.data, createdOrder.id));
  checks.push(list.evidence);

  const detailPath =
    `/tenant/branding/entitlement-orders/${encodeURIComponent(createdOrder.id)}`;
  const detail = await request(
    "tenant order detail",
    detailPath,
    input.config.adminToken,
  );
  withContractEvidence(detail.evidence, () =>
    assertSameOrder(detail.data, createdOrder.id, "tenant detail"));
  checks.push(detail.evidence);

  const isolated = await request(
    "cross-tenant order isolation",
    detailPath,
    input.config.isolationToken,
    { expectedStatuses: [404] },
  );
  withContractEvidence(isolated.evidence, () => {
    if (
      isolated.evidence.http_status !== 404 ||
      isolated.evidence.code !== "BRANDING_ADDON_ORDER_NOT_FOUND"
    ) throw contractFailure(
      "cross-tenant detail must return 404 BRANDING_ADDON_ORDER_NOT_FOUND",
    );
  });
  checks.push(isolated.evidence);

  const payment = await request(
    "payment request",
    `${detailPath}/payment-request`,
    input.config.adminToken,
    { method: "POST", body: {} },
  );
  withContractEvidence(payment.evidence, () => {
    assertSameOrder(payment.data, createdOrder.id, "payment request");
    assertPaymentRequest(payment.data);
  });
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
  withContractEvidence(platformProduct.evidence, () =>
    assertConfiguredPlatformProduct(platformProduct.data));
  input.checks.push(platformProduct.evidence);

  const platformList = await input.request(
    "platform order list",
    "/platform/branding/entitlement-orders?page=1&pageSize=20",
    token,
  );
  withContractEvidence(platformList.evidence, () =>
    assertPaginatedOrders(platformList.data, input.orderId));
  input.checks.push(platformList.evidence);

  const platformAudit = await input.request(
    "platform order audit",
    `/platform/branding/entitlement-orders/${encodeURIComponent(input.orderId)}`,
    token,
  );
  withContractEvidence(platformAudit.evidence, () =>
    assertSameOrder(platformAudit.data, input.orderId, "platform audit"));
  input.checks.push(platformAudit.evidence);
}

function getSmokeSecrets(
  config: BrandingAddonBatchBSmokeConfig,
): string[] {
  return [
    config.adminToken,
    config.isolationToken,
    ...(config.platformToken ? [config.platformToken] : []),
  ];
}

async function main(): Promise<number> {
  const parsed = parseBrandingAddonBatchBSmokeConfig();
  if (!parsed.ok) {
    console.error(parsed.errors.join("\n"));
    return 1;
  }
  try {
    console.log(JSON.stringify(
      sanitizeBrandingAddonSmokeOutput(
        parsed.config,
        await runBrandingAddonBatchBSmoke({ config: parsed.config }),
      ),
      null,
      2,
    ));
    return 0;
  } catch (error) {
    const failure = error instanceof BrandingAddonSmokeFailure
      ? error
      : contractFailure("branding addon Batch B smoke failed");
    console.error(JSON.stringify(
      sanitizeBrandingAddonSmokeOutput(parsed.config, {
        ok: false,
        code: failure.code,
        http_status: failure.http_status,
        request_id: failure.request_id,
        response: failure.response,
      }),
      null,
      2,
    ));
    return 1;
  }
}

if (import.meta.main) {
  void main().then((exitCode) => process.exit(exitCode));
}
