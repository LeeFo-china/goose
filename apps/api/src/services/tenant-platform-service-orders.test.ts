import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type {
  OrderRecord,
  ProductRecord,
} from "@/repositories/platform-service-order-records";
import type { AuthContext } from "@/services/authorization";
import type { WechatPayMiniProgramPaymentRequest } from "@/services/wechat-pay-signatures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "00000000-0000-4000-8000-000000000011";
const employeeId = "00000000-0000-4000-8000-000000000012";
const orderId = "00000000-0000-4000-8000-000000000301";
const productId = "00000000-0000-4000-8000-000000000101";
const productVersionId = "00000000-0000-4000-8000-000000000201";
const configId = "00000000-0000-4000-8000-000000000401";
const now = new Date("2026-08-03T12:00:00.000Z");

const tenantAuth = {
  authUserId: "auth-tenant",
  employeeId,
  tenantId,
  tenantName: "装企",
  tenantSlug: "tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "采购员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["system_admin"],
  roles: [],
  permissions: [
    { code: "billing.service_order.create", scope: "all" },
    { code: "billing.service_order.read", scope: "all" },
    { code: "billing.service_order.refund.request", scope: "all" },
  ],
} satisfies AuthContext;

const product = {
  id: productId,
  code: "platform_service_1y",
  status: "enabled",
  published_version_id: productVersionId,
  published_version: {
    id: productVersionId,
    version: 1,
    title: "平台部署及年度技术服务（1年）",
    term_years: 1,
    list_amount_fen: 980000,
    amount_fen: 980000,
    service_scope: ["部署", "培训"],
    terms_version: 1,
    terms_content: "服务条款",
  },
} satisfies ProductRecord;

const order = {
  id: orderId,
  tenant_id: tenantId,
  order_no: "TSO202608030001",
  out_trade_no: "TSO202608030001",
  product_code: "platform_service_1y",
  term_years: 1,
  amount_fen: 980000,
  payment_status: "pending",
  service_status: "waiting_payment",
  payment_config_id: configId,
  payment_config_guard_version: 7,
  payer_openid: "openid-user",
  prepay_id: "prepay-existing",
  payment_expires_at: "2026-08-03T12:05:00.000Z",
  paid_at: null,
  closed_at: null,
  terms_version: 1,
  version: 1,
  created_at: "2026-08-03T12:00:00.000Z",
  updated_at: "2026-08-03T12:00:00.000Z",
} satisfies OrderRecord;

const refundRequest = {
  id: "refund-1",
  tenant_id: tenantId,
  service_order_id: orderId,
  idempotency_key: "00000000-0000-4000-8000-000000000911",
  reason: "暂不需要服务",
  status: "reviewing",
  created_by_employee_id: employeeId,
  created_at: "2026-08-03T12:01:00.000Z",
  updated_at: "2026-08-03T12:01:00.000Z",
};

const paymentConfig = {
  id: configId,
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-platform",
  sub_app_id: null,
  encrypted_config_ref: "secret://wechat",
  secret_bundle_revision: "secret-rev-1",
  serial_no: "SERIAL",
  notify_url: "https://api.example.com/wechat/pay/callback",
  enabled_channels: ["platform_service"],
  status: "active",
  validation_status: "valid",
  recharge_guard_version: 7,
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-08-03T00:00:00.000Z",
  updated_at: "2026-08-03T00:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const secretBundle = {
  privateKeyPem: "private-key",
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "secret-rev-1",
};

const newPaymentRequest = {
  timeStamp: "1",
  nonceStr: "nonce-new",
  package: "prepay_id=prepay-new",
  signType: "RSA",
  paySign: "sign-new",
} satisfies WechatPayMiniProgramPaymentRequest;

const existingPaymentRequest = {
  timeStamp: "1",
  nonceStr: "nonce-existing",
  package: "prepay_id=prepay-existing",
  signType: "RSA",
  paySign: "sign-existing",
} satisfies WechatPayMiniProgramPaymentRequest;

function createRepository() {
  return {
    listEnabledProducts: mock(async (_input: unknown) => ({
      list: [product],
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

    await service.createPaymentRequest(tenantAuth, orderId, {
      expected_version: 1,
      idempotency_key: "00000000-0000-4000-8000-000000000902",
    }, "openid-user");

    expect(dependencies.repository.findEnabledProductByCode).not
      .toHaveBeenCalled();
    expect(dependencies.wechatPayGateway.createJsapiPrepay.mock.calls[0]?.[0])
      .toMatchObject({
        order: { amount: 9800 },
      });
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

  test("creates one order for the same tenant idempotency key", async () => {
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
      idempotency_key: "00000000-0000-4000-8000-000000000905",
    }, "openid-user");

    expect(result.idempotent).toBe(true);
    expect(dependencies.repository.createPendingOrder).not.toHaveBeenCalled();
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
    await service.getOrder(tenantAuth, orderId);

    expect(dependencies.repository.listOrders.mock.calls[0]?.[0])
      .toMatchObject({ tenantId, page: 2, pageSize: 10 });
    expect(dependencies.repository.findOrderByTenantAndId.mock.calls[0]?.[0])
      .toEqual({ tenantId, orderId });
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

});
