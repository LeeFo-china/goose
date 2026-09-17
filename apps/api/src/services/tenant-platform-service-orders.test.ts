import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  OrderRecord,
  ProductRecord,
} from "@/repositories/platform-service-order-records";
import type { AuthContext } from "@/services/authorization";
import {
  tenantId,
  orderId,
  productVersionId,
  sourceTrialId,
  now,
  tenantAuth,
  product,
  order,
  refundRequest,
  paymentConfig,
  secretBundle,
  newPaymentRequest,
  existingPaymentRequest,
  effectiveProduct,
  promotion,
} from "./tenant-platform-service-orders.test-fixtures";


process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

function createRepository() {
  return {
    listEnabledProducts: mock(async (_input: unknown) => ({
      list: [effectiveProduct],
      server_time: "2026-08-01T00:00:00+00:00",
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    })),
    listOrders: mock(async (_input: unknown) => ({
      list: [order],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    })),
    findEnabledProductByCode: mock(async (
      _productCode: string,
    ): Promise<ProductRecord | null> =>
      product
    ),
    findOrderByIdempotencyKey: mock(
      async (_input: unknown): Promise<OrderRecord | null> => null,
    ),
    createPendingOrder: mock(async (_input: unknown): Promise<OrderRecord> => ({
      ...order,
      prepay_id: null,
    })),
    markPrepayCreated: mock(async (input: { prepayId: string }) => ({
      ...order,
      prepay_id: input.prepayId,
    })),
    findOrderByTenantAndId: mock(
      async (_input: unknown): Promise<OrderRecord | null> => order,
    ),
    findOrderForPaymentByTenantAndId: mock(
      async (_input: unknown): Promise<OrderRecord | null> => order,
    ),
    findAcceptanceViewByTenantAndOrderId: mock(
      async (_input: unknown) => null,
    ),
    findTenantFulfillmentAttachmentPreview: mock(
      async (_input: unknown) => null,
    ),
    decideAcceptance: mock(async () => ({
      workOrder: null,
      order: null,
      acceptancePreparation: null,
      errorCode: "SERVICE_ACCEPTANCE_INVALID_STATE",
    })),
    requestRefundReview: mock(async (_input: unknown) => ({
      idempotent: false,
      refundRequest,
      order: {
        ...order,
        payment_status: "refund_reviewing",
        version: 2,
      },
    })),
  };
}

function createServiceDependencies() {
  const repository = createRepository();
  const paymentConfigRepository = {
    findWechatPayConfig: mock(async () => paymentConfig),
    findWechatPayConfigById: mock(async (_configId: string) => paymentConfig),
  };
  const accessPolicyService = {
    assertTenantContext: mock((authContext: AuthContext) => {
      if (!authContext.tenantId) throw new Error("tenant required");
      return authContext.tenantId;
    }),
    hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
      authContext.permissions.some((permission) =>
        permission.code === permissionCode
      )
    ),
  };
  const wechatPayGateway = {
    createJsapiPrepay: mock(async (_input: unknown) => ({
      prepayId: "prepay-new",
      paymentRequest: newPaymentRequest,
    })),
    createMiniProgramPaymentRequest: mock((_input: unknown) =>
      existingPaymentRequest
    ),
  };
  return {
    repository,
    paymentConfigRepository,
    accessPolicyService,
    secretBundleService: { load: mock(async () => secretBundle) },
    wechatPayGateway,
    tradeNoFactory: () => "TSO202608030001",
    nowFactory: () => now,
  };
}

describe("TenantPlatformServiceOrderService", () => {
  let dependencies: ReturnType<typeof createServiceDependencies>;

  beforeEach(() => {
    dependencies = createServiceDependencies();
  });

  test("lists only enabled products with pagination", async () => {
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    const result = await service.listProducts(tenantAuth, {
      page: 1,
      pageSize: 20,
    });

    expect(dependencies.repository.listEnabledProducts).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
    expect(result.list.at(0)!).toMatchObject({
      code: "platform_service_1y",
      amount_fen: 980000,
      pricing_version: 1,
      terms_content: "服务条款",
    });
  });

  test("uses a newly published price only for new orders", async () => {
    dependencies.repository.findEnabledProductByCode.mockImplementationOnce(
      async () => ({
        ...product,
        published_version: {
          ...product.published_version,
          version: 2,
          amount_fen: 880000,
        },
      }),
    );
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    await service.createOrder(tenantAuth, {
      product_code: "platform_service_1y",
      terms_version: 1,
      terms_accepted: true,
      idempotency_key: "00000000-0000-4000-8000-000000000901",
    }, "openid-user");

    expect(dependencies.repository.createPendingOrder.mock.calls[0]?.[0])
      .toMatchObject({
        amountFen: 880000,
        pricingVersion: 2,
        productVersionId,
      });
  });

  test("keeps an existing pending order amount after a later price publication", async () => {
    dependencies.repository.findOrderForPaymentByTenantAndId.mockImplementationOnce(
      async () => ({ ...order, prepay_id: null }),
    );
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    const result = await service.createPaymentRequest(tenantAuth, orderId, {
      expected_version: 1,
      idempotency_key: "00000000-0000-4000-8000-000000000902",
    }, "openid-user");

    expect(dependencies.repository.findEnabledProductByCode).not
      .toHaveBeenCalled();
    expect(dependencies.wechatPayGateway.createJsapiPrepay.mock.calls[0]?.[0])
      .toMatchObject({
        order: { amount: 9800 },
      });
    expect(result.order.pricing_version).toBe(3);
  });

  test("rejects a stale terms version", async () => {
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);
    await expect(service.createOrder(tenantAuth, {
      product_code: "platform_service_1y",
      terms_version: 0,
      terms_accepted: true,
      idempotency_key: "00000000-0000-4000-8000-000000000903",
    }, "openid-user")).rejects.toMatchObject({
      code: "SERVICE_TERMS_VERSION_STALE",
    });
    expect(dependencies.repository.createPendingOrder).not.toHaveBeenCalled();
  });

  test("derives price from the published database version and has no hard-coded fallback", async () => {
    dependencies.repository.findEnabledProductByCode.mockImplementationOnce(
      async () => null,
    );
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    await expect(service.createOrder(tenantAuth, {
      product_code: "missing",
      terms_version: 1,
      terms_accepted: true,
      idempotency_key: "00000000-0000-4000-8000-000000000904",
    }, "openid-user")).rejects.toMatchObject({
      code: "SERVICE_PRODUCT_NOT_FOUND",
    });
  });

  test("rejects an idempotent retry with a different trial source", async () => {
    dependencies.repository.findOrderByIdempotencyKey.mockImplementationOnce(
      async () => order,
    );
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    await expect(service.createOrder(tenantAuth, {
      product_code: "platform_service_1y",
      terms_version: 1,
      terms_accepted: true,
      idempotency_key: "00000000-0000-4000-8000-000000000905",
      source_trial_id: sourceTrialId,
    }, "openid-user")).rejects.toMatchObject({
      statusCode: 409,
      code: "SERVICE_TRIAL_ORDER_SOURCE_INVALID",
    });
    expect(dependencies.repository.createPendingOrder).not.toHaveBeenCalled();
    expect(dependencies.wechatPayGateway.createJsapiPrepay).not.toHaveBeenCalled();
  });

  test("creates JSAPI prepay with the platform ordinary payment profile", async () => {
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    await service.createOrder(tenantAuth, {
      product_code: "platform_service_1y",
      terms_version: 1,
      terms_accepted: true,
      idempotency_key: "00000000-0000-4000-8000-000000000906",
    }, "openid-user");

    expect(dependencies.wechatPayGateway.createJsapiPrepay.mock.calls[0]?.[0])
      .toMatchObject({
        config: {
          profile_code: "platform_direct_recharge",
          merchant_mode: "direct_merchant",
          enabled_channels: ["platform_service"],
        },
        description: "平台部署及年度技术服务（1年）",
      });
  });

  test("returns the same pending order on an idempotent retry", async () => {
    dependencies.repository.findOrderByIdempotencyKey.mockImplementationOnce(
      async () => order,
    );
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    const result = await service.createOrder(tenantAuth, {
      product_code: "platform_service_1y",
      terms_version: 1,
      terms_accepted: true,
      idempotency_key: "00000000-0000-4000-8000-000000000907",
    }, "openid-user");

    expect(result.idempotent).toBe(true);
    expect(result.product).toMatchObject({ amount_fen: 980000, promotion: null });
    expect(result.payment_request).toMatchObject({
      package: "prepay_id=prepay-existing",
    });
  });

  test("does not call any credit account or virtual product repository", async () => {
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    const result = await service.createOrder(tenantAuth, {
      product_code: "platform_service_1y",
      terms_version: 1,
      terms_accepted: true,
      idempotency_key: "00000000-0000-4000-8000-000000000908",
    }, "openid-user");

    const payload = JSON.stringify(result);
    expect(result.order.pricing_version).toBe(3);
    expect(payload).not.toContain("credit");
    expect(payload).not.toContain("virtual");
    expect(payload).not.toContain("积分");
  });

  test("lists and gets only current tenant orders", async () => {
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    await service.listOrders(tenantAuth, { page: 2, pageSize: 10 });
    const result = await service.getOrder(tenantAuth, orderId);

    expect(dependencies.repository.listOrders.mock.calls[0]?.[0])
      .toMatchObject({ tenantId, page: 2, pageSize: 10 });
    expect(dependencies.repository.findOrderByTenantAndId.mock.calls[0]?.[0])
      .toEqual({ tenantId, orderId });
    expect(result.order.pricing_version).toBe(3);
  });

  test("rejects continue payment after expiration or state change", async () => {
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    dependencies.repository.findOrderForPaymentByTenantAndId.mockImplementationOnce(
      async () => ({ ...order, payment_expires_at: "2026-08-03T11:59:00.000Z" }),
    );
    await expect(service.createPaymentRequest(tenantAuth, orderId, {
      expected_version: 1,
      idempotency_key: "00000000-0000-4000-8000-000000000909",
    }, "openid-user")).rejects.toMatchObject({
      code: "SERVICE_ORDER_INVALID_STATE",
    });

    dependencies.repository.findOrderForPaymentByTenantAndId.mockImplementationOnce(
      async () => ({ ...order, payment_status: "paid" }),
    );
    await expect(service.createPaymentRequest(tenantAuth, orderId, {
      expected_version: 1,
      idempotency_key: "00000000-0000-4000-8000-000000000910",
    }, "openid-user")).rejects.toMatchObject({
      code: "SERVICE_ORDER_INVALID_STATE",
    });
  });

  test.each([
    ["active", "2026-08-01T12:00:00Z", true],
    ["no promotion", "2026-07-01T00:00:00Z", false],
    ["scheduled", "2026-07-31T23:59:59Z", false],
    ["exact start", promotion.starts_at, true],
    ["exact end", promotion.ends_at, false],
    ["stopped", "2026-08-01T12:00:00Z", false],
  ])("preserves database %s pricing and server_time despite local clock", async (_state, serverTime, active) => {
    const item = {
      ...effectiveProduct,
      promotion: active ? promotion : null,
      amount_fen: active ? 196000 : 980000,
      effective_amount_fen: active ? 196000 : 980000,
      price_rate_basis_points: active ? 2000 : 10000,
    };
    dependencies.repository.listEnabledProducts.mockResolvedValueOnce({
      list: [item], server_time: String(serverTime),
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    const { TenantPlatformServiceOrderService } = await import("./tenant-platform-service-orders");
    const result = await new TenantPlatformServiceOrderService(dependencies).listProducts(tenantAuth);
    expect(result.server_time).toBe(serverTime);
    expect(result.list[0]).toMatchObject(item);
  });

  test.each([false, true])("uses the committed snapshot for first create/replay=%s", async (replay) => {
    const committed = {
      ...order,
      prepay_id: replay ? order.prepay_id : null,
      amount_fen: 196000,
      product_snapshot: {
        ...order.product_snapshot,
        title: "并发发布后锁定标题",
        amount_fen: 196000,
        base_amount_fen: 980000,
        effective_amount_fen: 196000,
        base_price_rate_basis_points: 10000,
        price_rate_basis_points: 2000,
        promotion,
      },
    };
    if (replay) {
      dependencies.repository.findOrderByIdempotencyKey.mockResolvedValueOnce(committed);
    } else {
      dependencies.repository.createPendingOrder.mockResolvedValueOnce(committed);
    }
    const { TenantPlatformServiceOrderService } = await import("./tenant-platform-service-orders");
    const result = await new TenantPlatformServiceOrderService(dependencies).createOrder(tenantAuth, {
      product_code: product.code, terms_version: 1, terms_accepted: true,
      idempotency_key: sourceTrialId,
    }, "openid-user");
    expect(result.order.amount_fen).toBe(196000);
    expect(result.product).toMatchObject({ title: "并发发布后锁定标题", amount_fen: 196000,
      promotion: { version_id: sourceTrialId }, pricing_version: 3 });
    expect(result.server_time).toBe(now.toISOString());
    if (replay) {
      expect(dependencies.repository.findEnabledProductByCode).not.toHaveBeenCalled();
    } else {
      expect(dependencies.wechatPayGateway.createJsapiPrepay.mock.calls[0]?.[0])
        .toMatchObject({ order: { amount: 1960 }, description: "并发发布后锁定标题" });
    }
  });

});
