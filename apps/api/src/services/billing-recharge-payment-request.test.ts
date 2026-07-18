import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const pendingOrder = {
  id: "order-1",
  tenant_id: "tenant-1",
  order_no: "TC202607180001",
  idempotency_key: "b14cf778-17fc-4d08-86f7-7579ed1a0668",
  package_code: "credit_1000",
  credits: 1000,
  amount_fen: 10000,
  bonus_credits: 100,
  channel: "wechat_pay",
  status: "pending",
  paid_at: null,
  created_by: "employee-1",
  remark: null,
  metadata: { product_snapshot: { code: "credit_1000" } },
  payment_config_id: "platform-config-1",
  out_trade_no: "TC202607180001",
  prepay_id: "prepay-1",
  payment_expires_at: "2026-07-18T02:05:00.000Z",
  transaction_id: null,
  paid_amount_fen: 0,
  closed_at: null,
  latest_notification_id: null,
  created_at: "2026-07-18T02:00:00.000Z",
  updated_at: "2026-07-18T02:00:01.000Z",
} satisfies TenantCreditOrderRecord;

const platformConfig = {
  id: "platform-config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-platform-app",
  sub_app_id: null,
  encrypted_config_ref: "secret://platform/wechat-pay",
  serial_no: "SERIALNO",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const secretBundle = {
  privateKeyPem: "private-key",
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
};

const rechargeRepository = {
  listEnabledProducts: mock(async () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  listOrders: mock(async () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  findEnabledProductByCode: mock(async () => null),
  findOrderByIdempotencyKey: mock(
    async (): Promise<TenantCreditOrderRecord | null> => null,
  ),
  createOrder: mock(async () => pendingOrder),
  markPrepayCreated: mock(async () => pendingOrder),
  findOrderById: mock(
    async (): Promise<TenantCreditOrderRecord | null> => pendingOrder,
  ),
  getAccountByTenantId: mock(async () => null),
};

const paymentConfigRepository = {
  findWechatPayConfig: mock(
    async (): Promise<PlatformPaymentConfigRecord | null> => platformConfig,
  ),
};

const accessPolicy = {
  assertTenantContext: mock((authContext: AuthContext) => {
    if (!authContext.tenantId) {
      throw Object.assign(new Error("缺少租户上下文"), {
        statusCode: 403,
        code: "TENANT_CONTEXT_REQUIRED",
      });
    }
    return authContext.tenantId;
  }),
  hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
    authContext.permissions.some((permission) => permission.code === permissionCode)
  ),
};

const secretBundleService = {
  load: mock(async () => secretBundle),
};

const createJsapiPrepay = mock(async () => ({
  prepayId: "unexpected-prepay",
  paymentRequest: {
    timeStamp: "1782873600",
    nonceStr: "nonce-unexpected",
    package: "prepay_id=unexpected-prepay",
    signType: "RSA" as const,
    paySign: "unexpected-sign",
  },
}));
const createMiniProgramPaymentRequest = mock(() => ({
  timeStamp: "1784368800",
  nonceStr: "nonce-resigned",
  package: "prepay_id=prepay-1",
  signType: "RSA" as const,
  paySign: "pay-sign-resigned",
}));
const wechatPayGateway = {
  createJsapiPrepay,
  createMiniProgramPaymentRequest,
};
const nowFactory = mock(() => new Date("2026-07-18T02:00:00.000Z"));

const authContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [{ code: "billing.recharge.create", scope: "all" }],
} satisfies AuthContext;

async function createService() {
  const { BillingRechargeService } = await import("./billing-recharge");
  return new BillingRechargeService({
    rechargeRepository,
    paymentConfigRepository,
    accessPolicyService: accessPolicy,
    secretBundleService,
    wechatPayGateway,
    tradeNoFactory: () => "TC202607180001",
    nowFactory,
  });
}

describe("BillingRechargeService payment request", () => {
  beforeEach(() => {
    for (const item of [
      ...Object.values(rechargeRepository),
      paymentConfigRepository.findWechatPayConfig,
      accessPolicy.assertTenantContext,
      accessPolicy.hasPermission,
      secretBundleService.load,
      createJsapiPrepay,
      createMiniProgramPaymentRequest,
      nowFactory,
    ]) {
      item.mockClear();
    }
    rechargeRepository.findOrderById.mockImplementation(async () => pendingOrder);
    rechargeRepository.findOrderByIdempotencyKey.mockImplementation(async () => null);
    paymentConfigRepository.findWechatPayConfig.mockImplementation(
      async () => platformConfig,
    );
  });

  test("re-signs an unexpired pending order locally", async () => {
    const service = await createService();

    const result = await service.createPaymentRequest(authContext, "order-1");

    expect(rechargeRepository.findOrderById).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      orderId: "order-1",
    });
    expect(createMiniProgramPaymentRequest).toHaveBeenCalledWith({
      config: platformConfig,
      prepayId: "prepay-1",
      secretBundle,
    });
    expect(createMiniProgramPaymentRequest).toHaveBeenCalledTimes(1);
    expect(createJsapiPrepay).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      order: {
        id: "order-1",
        payment_action: {
          enabled: true,
          disabled_reason: null,
        },
      },
      payment_request: { paySign: "pay-sign-resigned" },
      server_time: "2026-07-18T02:00:00.000Z",
    });
    expect(nowFactory).toHaveBeenCalledTimes(1);
  });

  test("requires recharge create permission before reading the order", async () => {
    const service = await createService();
    const unauthorized = { ...authContext, permissions: [] } satisfies AuthContext;

    await expect(service.createPaymentRequest(unauthorized, "order-1"))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    expect(rechargeRepository.findOrderById).not.toHaveBeenCalled();
  });

  test("scopes lookup to the tenant and reports a missing order", async () => {
    rechargeRepository.findOrderById.mockImplementation(async () => null);
    const service = await createService();

    await expect(service.createPaymentRequest(authContext, "other-order"))
      .rejects.toMatchObject({
        statusCode: 404,
        code: "BILLING_RECHARGE_ORDER_NOT_FOUND",
      });

    expect(rechargeRepository.findOrderById).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      orderId: "other-order",
    });
  });

  test.each(["paid", "closed", "refunded"] as const)(
    "rejects a %s order because it is not pending",
    async (status) => {
      rechargeRepository.findOrderById.mockImplementation(async () => ({
        ...pendingOrder,
        status,
      }));
      const service = await createService();

      await expect(service.createPaymentRequest(authContext, "order-1"))
        .rejects.toMatchObject({
          statusCode: 409,
          code: "BILLING_RECHARGE_ORDER_NOT_PENDING",
        });

      expect(createMiniProgramPaymentRequest).not.toHaveBeenCalled();
    },
  );

  test("rejects a non-WeChat pending order before loading payment dependencies", async () => {
    rechargeRepository.findOrderById.mockImplementation(async () => ({
      ...pendingOrder,
      channel: "manual",
    }));
    const service = await createService();

    await expect(service.createPaymentRequest(authContext, "order-1"))
      .rejects.toMatchObject({
        statusCode: 409,
        code: "BILLING_RECHARGE_PAYMENT_CHANNEL_UNSUPPORTED",
      });

    expect(paymentConfigRepository.findWechatPayConfig).not.toHaveBeenCalled();
    expect(secretBundleService.load).not.toHaveBeenCalled();
    expect(createMiniProgramPaymentRequest).not.toHaveBeenCalled();
  });

  test.each([
    ["expiration boundary", "2026-07-18T02:00:00.000Z"],
    ["invalid expiration", "invalid-date"],
    ["invalid calendar expiration", "2027-02-30T02:05:00.000Z"],
    ["missing expiration", null],
  ])("rejects %s", async (_, paymentExpiresAt) => {
    rechargeRepository.findOrderById.mockImplementation(async () => ({
      ...pendingOrder,
      payment_expires_at: paymentExpiresAt,
    }));
    const service = await createService();

    await expect(service.createPaymentRequest(authContext, "order-1"))
      .rejects.toMatchObject({
        statusCode: 409,
        code: "BILLING_RECHARGE_ORDER_EXPIRED",
      });

    expect(createMiniProgramPaymentRequest).not.toHaveBeenCalled();
  });

  test("reports expiration before a missing prepay id", async () => {
    rechargeRepository.findOrderById.mockImplementation(async () => ({
      ...pendingOrder,
      prepay_id: null,
      payment_expires_at: "2026-07-18T02:00:00.000Z",
    }));
    const service = await createService();

    await expect(service.createPaymentRequest(authContext, "order-1"))
      .rejects.toMatchObject({
        statusCode: 409,
        code: "BILLING_RECHARGE_ORDER_EXPIRED",
      });
  });

  test("rejects an order without a usable prepay id", async () => {
    rechargeRepository.findOrderById.mockImplementation(async () => ({
      ...pendingOrder,
      prepay_id: "  ",
    }));
    const service = await createService();

    await expect(service.createPaymentRequest(authContext, "order-1"))
      .rejects.toMatchObject({
        statusCode: 409,
        code: "BILLING_RECHARGE_PAYMENT_REQUEST_UNAVAILABLE",
      });
  });

  test("rejects an order tied to a different payment config", async () => {
    paymentConfigRepository.findWechatPayConfig.mockImplementation(async () => ({
      ...platformConfig,
      id: "platform-config-2",
    }));
    const service = await createService();

    await expect(service.createPaymentRequest(authContext, "order-1"))
      .rejects.toMatchObject({
        statusCode: 409,
        code: "BILLING_RECHARGE_PAYMENT_CONFIG_MISMATCH",
      });

    expect(secretBundleService.load).not.toHaveBeenCalled();
    expect(createMiniProgramPaymentRequest).not.toHaveBeenCalled();
  });

  test("re-signs an idempotent pending create without creating another order", async () => {
    rechargeRepository.findOrderByIdempotencyKey.mockImplementation(
      async () => pendingOrder,
    );
    const service = await createService();

    const result = await service.createOrder(authContext, {
      package_code: "credit_1000",
      payer_openid: "openid-1",
      idempotency_key: pendingOrder.idempotency_key,
    });

    expect(result).toMatchObject({
      idempotent: true,
      product: null,
      payment_request: { paySign: "pay-sign-resigned" },
      server_time: "2026-07-18T02:00:00.000Z",
    });
    expect(createMiniProgramPaymentRequest).toHaveBeenCalledTimes(1);
    expect(rechargeRepository.createOrder).not.toHaveBeenCalled();
    expect(createJsapiPrepay).not.toHaveBeenCalled();
    expect(nowFactory).toHaveBeenCalledTimes(1);
  });

  test("does not re-sign an idempotent non-WeChat pending order", async () => {
    rechargeRepository.findOrderByIdempotencyKey.mockImplementation(
      async () => ({ ...pendingOrder, channel: "manual" }),
    );
    const service = await createService();

    await expect(service.createOrder(authContext, {
      package_code: "credit_1000",
      payer_openid: "openid-1",
      idempotency_key: pendingOrder.idempotency_key,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BILLING_RECHARGE_PAYMENT_CHANNEL_UNSUPPORTED",
    });

    expect(paymentConfigRepository.findWechatPayConfig).not.toHaveBeenCalled();
    expect(secretBundleService.load).not.toHaveBeenCalled();
    expect(createMiniProgramPaymentRequest).not.toHaveBeenCalled();
    expect(createJsapiPrepay).not.toHaveBeenCalled();
  });

  test.each(["paid", "closed", "refunded"] as const)(
    "returns no payment request for an idempotent %s order",
    async (status) => {
      rechargeRepository.findOrderByIdempotencyKey.mockImplementation(
        async () => ({ ...pendingOrder, status }),
      );
      const service = await createService();

      const result = await service.createOrder(authContext, {
        package_code: "credit_1000",
        payer_openid: "openid-1",
        idempotency_key: pendingOrder.idempotency_key,
      });

      expect(result.payment_request).toBeNull();
      expect(result.server_time).toBe("2026-07-18T02:00:00.000Z");
      expect(createMiniProgramPaymentRequest).not.toHaveBeenCalled();
      expect(rechargeRepository.createOrder).not.toHaveBeenCalled();
    },
  );

  test.each([
    [
      "expired",
      { payment_expires_at: "2026-07-18T02:00:00.000Z" },
      "BILLING_RECHARGE_ORDER_EXPIRED",
    ],
    [
      "missing prepay id",
      { prepay_id: null },
      "BILLING_RECHARGE_PAYMENT_REQUEST_UNAVAILABLE",
    ],
  ])("rejects an idempotent pending order that is %s", async (_, override, code) => {
    rechargeRepository.findOrderByIdempotencyKey.mockImplementation(
      async () => ({ ...pendingOrder, ...override }),
    );
    const service = await createService();

    await expect(service.createOrder(authContext, {
      package_code: "credit_1000",
      payer_openid: "openid-1",
      idempotency_key: pendingOrder.idempotency_key,
    })).rejects.toMatchObject({ statusCode: 409, code });

    expect(rechargeRepository.createOrder).not.toHaveBeenCalled();
    expect(createJsapiPrepay).not.toHaveBeenCalled();
  });
});
