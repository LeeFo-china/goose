import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  CreditRechargeProductRecord,
  TenantCreditOrderRecord,
} from "@/repositories/billing-recharge";
import type { BillingAccountBalance } from "@/repositories/billing";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const product = {
  id: "product-1",
  code: "credit_1000",
  title: "1000 积分",
  amount_fen: 10000,
  credits: 1000,
  bonus_credits: 100,
  enabled: true,
  sort_order: 10,
  metadata: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-02T08:00:00.000Z",
  updated_at: "2026-07-02T08:00:00.000Z",
} satisfies CreditRechargeProductRecord;

const order = {
  id: "order-1",
  tenant_id: "tenant-1",
  order_no: "TC202607020001",
  idempotency_key: "idem-1",
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
  out_trade_no: "TC202607020001",
  prepay_id: null,
  payment_expires_at: "2026-07-18T02:05:00.000Z",
  transaction_id: null,
  paid_amount_fen: 0,
  closed_at: null,
  latest_notification_id: null,
  created_at: "2026-07-02T08:01:00.000Z",
  updated_at: "2026-07-02T08:01:00.000Z",
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
  secret_bundle_revision: "bundle-revision-1",
  serial_no: "SERIALNO",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  recharge_guard_version: 1,
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-02T08:00:00.000Z",
  updated_at: "2026-07-02T08:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const account = {
  id: "account-1",
  tenant_id: "tenant-1",
  balance_credits: 2000,
  frozen_credits: 0,
  available_credits: 2000,
  total_recharged_credits: 2000,
  total_consumed_credits: 0,
  status: "active",
  last_activity_at: null,
  updated_at: "2026-07-02T08:00:00.000Z",
} satisfies BillingAccountBalance;

const paidOrder = {
  ...order,
  status: "paid",
  paid_at: "2026-07-02T08:03:00.000Z",
} satisfies TenantCreditOrderRecord;

const inactivePlatformConfig = {
  ...platformConfig,
  status: "pending",
} satisfies PlatformPaymentConfigRecord;

const rechargeRepository = {
  listEnabledProducts: mock(async () => ({
    list: [product],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  listOrders: mock(async () => ({
    list: [
      {
        ...paidOrder,
        metadata: {
          product_snapshot: {
            code: "credit_1000",
            title: "1000 积分",
          },
        },
      },
    ],
    pagination: { page: 2, pageSize: 10, total: 1, totalPages: 1 },
  })),
  findEnabledProductByCode: mock(async () => product),
  findOrderByIdempotencyKey: mock(async () => null),
  createOrder: mock(async () => order),
  markPrepayCreated: mock(async () => ({ ...order, prepay_id: "prepay-1" })),
  findOrderById: mock(
    async (): Promise<TenantCreditOrderRecord | null> => paidOrder,
  ),
  getAccountByTenantId: mock(async () => account),
};

const paymentConfigRepository = {
  findWechatPayConfig: mock(
    async (): Promise<PlatformPaymentConfigRecord> => platformConfig,
  ),
  findWechatPayConfigById: mock(
    async (): Promise<PlatformPaymentConfigRecord> => platformConfig,
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
  load: mock(async () => ({
    privateKeyPem: "private-key",
    apiV3Key: "api-v3-key",
    wechatPayPublicKeyId: null,
    wechatPayPublicKeyPem: null,
    baseUrl: "https://api.mch.weixin.qq.com",
  })),
};

const wechatPayGateway = {
  createJsapiPrepay: mock(async () => ({
    prepayId: "prepay-1",
    paymentRequest: {
      timeStamp: "1782873600",
      nonceStr: "nonce",
      package: "prepay_id=prepay-1",
      signType: "RSA" as const,
      paySign: "pay-sign",
    },
  })),
  createMiniProgramPaymentRequest: mock(() => ({
    timeStamp: "1782873600",
    nonceStr: "nonce-resigned",
    package: "prepay_id=prepay-1",
    signType: "RSA" as const,
    paySign: "pay-sign-resigned",
  })),
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
  permissions: [
    { code: "billing.recharge.create", scope: "all" },
    { code: "billing.recharge.read", scope: "all" },
  ],
} satisfies AuthContext;

async function createService() {
  const { BillingRechargeService } = await import("./billing-recharge");
  return new BillingRechargeService({
    rechargeRepository,
    paymentConfigRepository,
    accessPolicyService: accessPolicy,
    secretBundleService,
    wechatPayGateway,
    tradeNoFactory: () => "TC202607020001",
    nowFactory,
  });
}

describe("BillingRechargeService", () => {
  beforeEach(() => {
    for (const item of [
      ...Object.values(rechargeRepository),
      paymentConfigRepository.findWechatPayConfig,
      paymentConfigRepository.findWechatPayConfigById,
      accessPolicy.assertTenantContext,
      accessPolicy.hasPermission,
      secretBundleService.load,
      wechatPayGateway.createJsapiPrepay,
      wechatPayGateway.createMiniProgramPaymentRequest,
      nowFactory,
    ]) {
      item.mockClear();
    }
    rechargeRepository.findEnabledProductByCode.mockImplementation(async () => product);
    rechargeRepository.findOrderByIdempotencyKey.mockImplementation(async () => null);
    rechargeRepository.findOrderById.mockImplementation(async () => paidOrder);
    rechargeRepository.getAccountByTenantId.mockImplementation(async () => account);
    paymentConfigRepository.findWechatPayConfig.mockImplementation(
      async (): Promise<PlatformPaymentConfigRecord> => platformConfig,
    );
    paymentConfigRepository.findWechatPayConfigById.mockImplementation(
      async (): Promise<PlatformPaymentConfigRecord> => platformConfig,
    );
  });

  test("lists enabled recharge products for tenants with recharge permission", async () => {
    const service = await createService();

    const result = await service.listProducts(authContext);

    expect(rechargeRepository.listEnabledProducts).toHaveBeenCalled();
    expect(result.list).toEqual([
      expect.objectContaining({
        code: "credit_1000",
        amount_fen: 10000,
        credits: 1000,
        bonus_credits: 100,
      }),
    ]);
  });

  test("lists tenant wechat recharge orders with backend refund action", async () => {
    const service = await createService();

    const result = await service.listOrders(authContext, {
      page: 2,
      pageSize: 10,
      status: "paid",
      keyword: "TC202607",
    });

    expect(rechargeRepository.listOrders).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      page: 2,
      pageSize: 10,
      status: "paid",
      keyword: "TC202607",
    });
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    expect(result.server_time).toBe("2026-07-18T02:00:00.000Z");
    expect(nowFactory).toHaveBeenCalledTimes(1);
    expect(result.list).toEqual([
      expect.objectContaining({
        id: "order-1",
        tenant_id: "tenant-1",
        order_no: "TC202607020001",
        package_code: "credit_1000",
        product_title: "1000 积分",
        amount_fen: 10000,
        credits: 1000,
        bonus_credits: 100,
        channel: "wechat_pay",
        status: "paid",
        paid_at: "2026-07-02T08:03:00.000Z",
        paid_amount_fen: 0,
        out_trade_no: "TC202607020001",
        transaction_id: null,
        refund_status: null,
        refund_requested_at: null,
        refunded_at: null,
        refund_amount_fen: null,
        refund_action: {
          enabled: true,
          label: "申请退款",
          disabled_reason: null,
          requires_reason: true,
        },
      }),
    ]);
  });

  test("creates wechat prepay order from backend product pricing", async () => {
    const service = await createService();

    const result = await service.createOrder(authContext, {
      package_code: "credit_1000",
      payer_openid: "openid-1",
      idempotency_key: "idem-1",
    });

    expect(rechargeRepository.createOrder).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      order_no: "TC202607020001",
      out_trade_no: "TC202607020001",
      idempotency_key: "idem-1",
      package_code: "credit_1000",
      credits: 1000,
      bonus_credits: 100,
      amount_fen: 10000,
      channel: "wechat_pay",
      status: "pending",
      created_by: "employee-1",
      payment_config_id: "platform-config-1",
      expected_payment_config_guard_version: 1,
      payment_expires_at: "2026-07-18T02:05:00.000Z",
      metadata: {
        payer_openid: "openid-1",
        product_snapshot: {
          code: "credit_1000",
          title: "1000 积分",
          amount_fen: 10000,
          credits: 1000,
          bonus_credits: 100,
        },
      },
    });
    expect(wechatPayGateway.createJsapiPrepay).toHaveBeenCalledWith(
      expect.objectContaining({
        config: platformConfig,
        order: expect.objectContaining({
          out_trade_no: "TC202607020001",
          amount: 100,
          payer_openid: "openid-1",
          payment_expires_at: "2026-07-18T02:05:00.000Z",
        }),
        description: "积分充值",
      }),
    );
    expect(result.payment_request).toMatchObject({
      package: "prepay_id=prepay-1",
      paySign: "pay-sign",
    });
    expect(result.server_time).toBe("2026-07-18T02:00:00.000Z");
    expect(nowFactory).toHaveBeenCalledTimes(3);
    expect(result.order).toMatchObject({
      status: "pending",
      credits: 1000,
      bonus_credits: 100,
    });
    expect(secretBundleService.load).toHaveBeenCalledTimes(2);
    expect(paymentConfigRepository.findWechatPayConfigById)
      .toHaveBeenCalledWith("platform-config-1");
  });

  test("uses the post-insert config and secret rather than the preflight snapshot", async () => {
    const reloadedConfig = {
      ...platformConfig,
      merchant_name: "事务后重新加载的配置",
    };
    paymentConfigRepository.findWechatPayConfigById.mockImplementationOnce(
      async () => reloadedConfig,
    );
    const service = await createService();

    await service.createOrder(authContext, {
      package_code: "credit_1000",
      payer_openid: "openid-1",
    });

    expect(wechatPayGateway.createJsapiPrepay).toHaveBeenCalledWith(
      expect.objectContaining({ config: reloadedConfig }),
    );
  });

  test("returns a stable retryable conflict without prepay when config CAS loses", async () => {
    rechargeRepository.createOrder.mockImplementationOnce(async () => {
      throw Object.assign(new Error("配置已轮换"), {
        statusCode: 409,
        code: "BILLING_RECHARGE_PAYMENT_CONFIG_VERSION_CHANGED",
      });
    });
    const service = await createService();

    await expect(service.createOrder(authContext, {
      package_code: "credit_1000",
      payer_openid: "openid-1",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BILLING_RECHARGE_PAYMENT_CONFIG_VERSION_CHANGED",
    });

    expect(paymentConfigRepository.findWechatPayConfigById).not
      .toHaveBeenCalled();
    expect(wechatPayGateway.createJsapiPrepay).not.toHaveBeenCalled();
    expect(rechargeRepository.markPrepayCreated).not.toHaveBeenCalled();
  });

  test("rejects recharge when platform wechat pay config is not active", async () => {
    paymentConfigRepository.findWechatPayConfig.mockImplementation(
      async (): Promise<PlatformPaymentConfigRecord> => inactivePlatformConfig,
    );
    const service = await createService();

    await expect(
      service.createOrder(authContext, {
        package_code: "credit_1000",
        payer_openid: "openid-1",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_PAYMENT_CONFIG_INVALID",
    });
    expect(rechargeRepository.createOrder).not.toHaveBeenCalled();
  });

  test("returns order status with current billing account", async () => {
    const service = await createService();

    const result = await service.getOrder(authContext, "order-1");

    expect(rechargeRepository.findOrderById).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      orderId: "order-1",
    });
    expect(result.order).toMatchObject({ id: "order-1", status: "paid" });
    expect(result.account).toMatchObject({ available_credits: 2000 });
    expect(result.server_time).toBe("2026-07-18T02:00:00.000Z");
    expect(nowFactory).toHaveBeenCalledTimes(1);
  });
});
