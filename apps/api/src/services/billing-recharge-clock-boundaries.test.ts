import { describe, expect, mock, test } from "bun:test";
import type {
  CreditRechargeProductRecord,
  TenantCreditOrderCreateInput,
  TenantCreditOrderRecord,
} from "@/repositories/billing-recharge";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const product = {
  id: "product-1",
  code: "credit_1000",
  title: "1000 积分",
  amount_fen: 10_000,
  credits: 1_000,
  bonus_credits: 100,
  enabled: true,
  sort_order: 1,
  metadata: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-18T02:00:00.000Z",
  updated_at: "2026-07-18T02:00:00.000Z",
} satisfies CreditRechargeProductRecord;

const pendingOrder = {
  id: "order-1",
  tenant_id: "tenant-1",
  order_no: "TC202607180001",
  idempotency_key: "idem-1",
  package_code: product.code,
  credits: product.credits,
  amount_fen: product.amount_fen,
  bonus_credits: product.bonus_credits,
  channel: "wechat_pay",
  status: "pending",
  paid_at: null,
  created_by: "employee-1",
  remark: null,
  metadata: { product_snapshot: { code: product.code, title: product.title } },
  payment_config_id: "config-1",
  out_trade_no: "TC202607180001",
  prepay_id: "prepay-1",
  payment_expires_at: "2026-07-18T02:05:00.000Z",
  transaction_id: null,
  paid_amount_fen: 0,
  closed_at: null,
  latest_notification_id: null,
  created_at: "2026-07-18T02:00:00.000Z",
  updated_at: "2026-07-18T02:00:00.000Z",
} satisfies TenantCreditOrderRecord;

const config = {
  id: "config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-app",
  sub_app_id: null,
  encrypted_config_ref: "secret://wechat-pay",
  secret_bundle_revision: "bundle-revision-1",
  serial_no: "SERIALNO",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  recharge_guard_version: 1,
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-18T02:00:00.000Z",
  updated_at: "2026-07-18T02:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

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

describe("BillingRechargeService clock boundaries", () => {
  test("samples list server time after repository IO", async () => {
    const harness = await createHarness();
    harness.repository.listOrders.mockImplementationOnce(async () => {
      harness.setNow("2026-07-18T02:05:00.000Z");
      return page([pendingOrder]);
    });

    const result = await harness.service.listOrders(authContext);

    expect(result.server_time).toBe("2026-07-18T02:05:00.000Z");
    expect(result.list[0]?.payment_action).toMatchObject({
      enabled: false,
      disabled_reason: "ORDER_PAYMENT_EXPIRED",
    });
  });

  test("starts the five-minute window immediately before order creation", async () => {
    const harness = await createHarness();
    harness.repository.findEnabledProductByCode.mockImplementationOnce(async () => {
      harness.setNow("2026-07-18T02:01:00.000Z");
      return product;
    });

    await harness.service.createOrder(authContext, {
      package_code: product.code,
      payer_openid: "openid-1",
    });

    expect(harness.repository.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_expires_at: "2026-07-18T02:06:00.000Z",
      }),
    );
  });

  test("suppresses prepay output when upstream IO crosses expiration", async () => {
    const harness = await createHarness();
    harness.gateway.createJsapiPrepay.mockImplementationOnce(async () => {
      harness.setNow("2026-07-18T02:05:00.000Z");
      return paymentResult();
    });
    harness.repository.markPrepayCreated.mockImplementationOnce(async () => null);
    harness.repository.findOrderById.mockImplementationOnce(async () => ({
      ...pendingOrder,
      prepay_id: null,
    }));

    const result = await harness.service.createOrder(authContext, {
      package_code: product.code,
      payer_openid: "openid-1",
    });

    expect(harness.repository.markPrepayCreated).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      orderId: pendingOrder.id,
      prepayId: "prepay-1",
      now: new Date("2026-07-18T02:05:00.000Z"),
    });
    expect(result.payment_request).toBeNull();
    expect(result.order.payment_action).toMatchObject({
      enabled: false,
      disabled_reason: "ORDER_PAYMENT_EXPIRED",
    });
    expect(result.server_time).toBe("2026-07-18T02:05:00.000Z");
  });

  test("rechecks expiration after loading config before re-signing", async () => {
    const harness = await createHarness("2026-07-18T02:04:59.000Z");
    harness.paymentConfigRepository.findWechatPayConfig
      .mockImplementationOnce(async () => {
        harness.setNow("2026-07-18T02:05:00.000Z");
        return config;
      });

    const result = await harness.service.createPaymentRequest(
      authContext,
      pendingOrder.id,
    );

    expect(result.payment_request).toBeNull();
    expect(result.order.payment_action.disabled_reason)
      .toBe("ORDER_PAYMENT_EXPIRED");
    expect(result.server_time).toBe("2026-07-18T02:05:00.000Z");
    expect(harness.secretBundleService.load).not.toHaveBeenCalled();
    expect(harness.gateway.createMiniProgramPaymentRequest).not.toHaveBeenCalled();
  });

  test("rechecks expiration after loading secrets before re-signing", async () => {
    const harness = await createHarness("2026-07-18T02:04:59.000Z");
    harness.secretBundleService.load.mockImplementationOnce(async () => {
      harness.setNow("2026-07-18T02:05:00.000Z");
      return secretBundle();
    });

    const result = await harness.service.createPaymentRequest(
      authContext,
      pendingOrder.id,
    );

    expect(result.payment_request).toBeNull();
    expect(result.order.payment_action.disabled_reason)
      .toBe("ORDER_PAYMENT_EXPIRED");
    expect(harness.gateway.createMiniProgramPaymentRequest).not.toHaveBeenCalled();
  });

  test("does not return a signature after signing crosses expiration", async () => {
    const harness = await createHarness("2026-07-18T02:04:59.000Z");
    harness.gateway.createMiniProgramPaymentRequest.mockImplementationOnce(() => {
      harness.setNow("2026-07-18T02:05:00.000Z");
      return paymentResult().paymentRequest;
    });

    const result = await harness.service.createPaymentRequest(
      authContext,
      pendingOrder.id,
    );

    expect(harness.gateway.createMiniProgramPaymentRequest).toHaveBeenCalledTimes(1);
    expect(result.payment_request).toBeNull();
    expect(result.order.payment_action.disabled_reason)
      .toBe("ORDER_PAYMENT_EXPIRED");
  });

  test("samples detail server time after account IO", async () => {
    const harness = await createHarness();
    harness.repository.getAccountByTenantId.mockImplementationOnce(async () => {
      harness.setNow("2026-07-18T02:05:00.000Z");
      return null;
    });

    const result = await harness.service.getOrder(authContext, pendingOrder.id);

    expect(result.server_time).toBe("2026-07-18T02:05:00.000Z");
    expect(result.order.payment_action.disabled_reason)
      .toBe("ORDER_PAYMENT_EXPIRED");
  });

  test("uses a fresh final clock for an idempotent pending order", async () => {
    const harness = await createHarness("2026-07-18T02:04:59.000Z");
    harness.repository.findOrderByIdempotencyKey.mockImplementationOnce(
      async () => pendingOrder,
    );
    harness.paymentConfigRepository.findWechatPayConfig
      .mockImplementationOnce(async () => {
        harness.setNow("2026-07-18T02:05:00.000Z");
        return config;
      });

    const result = await harness.service.createOrder(authContext, {
      package_code: product.code,
      payer_openid: "openid-1",
      idempotency_key: pendingOrder.idempotency_key,
    });

    expect(result.payment_request).toBeNull();
    expect(result.order.payment_action.disabled_reason)
      .toBe("ORDER_PAYMENT_EXPIRED");
    expect(result.server_time).toBe("2026-07-18T02:05:00.000Z");
  });
});

async function createHarness(initialNow = "2026-07-18T02:00:00.000Z") {
  let currentNow = initialNow;
  const repository = {
    listEnabledProducts: mock(async () => page([product])),
    listOrders: mock(async () => page([pendingOrder])),
    findEnabledProductByCode: mock(async () => product),
    findOrderByIdempotencyKey: mock(
      async (): Promise<TenantCreditOrderRecord | null> => null,
    ),
    createOrder: mock(async (input: TenantCreditOrderCreateInput) => ({
      ...pendingOrder,
      prepay_id: null,
      payment_expires_at: input.payment_expires_at,
    })),
    markPrepayCreated: mock(async (_input: {
      tenantId: string;
      orderId: string;
      prepayId: string;
      now?: Date;
    }): Promise<TenantCreditOrderRecord | null> => pendingOrder),
    findOrderById: mock(
      async (): Promise<TenantCreditOrderRecord | null> => pendingOrder,
    ),
    getAccountByTenantId: mock(async () => null),
  };
  const paymentConfigRepository = {
    findWechatPayConfig: mock(async () => config),
    findWechatPayConfigById: mock(async () => config),
  };
  const secretBundleService = {
    load: mock(async () => secretBundle()),
  };
  const gateway = {
    createJsapiPrepay: mock(async () => paymentResult()),
    createMiniProgramPaymentRequest: mock(() => paymentResult().paymentRequest),
  };
  const { BillingRechargeService } = await import("./billing-recharge");
  const service = new BillingRechargeService({
    rechargeRepository: repository,
    paymentConfigRepository,
    accessPolicyService: {
      assertTenantContext: () => "tenant-1",
      hasPermission: () => true,
    },
    secretBundleService,
    wechatPayGateway: gateway,
    tradeNoFactory: () => pendingOrder.order_no,
    nowFactory: () => new Date(currentNow),
  });
  return {
    service,
    repository,
    paymentConfigRepository,
    secretBundleService,
    gateway,
    setNow: (value: string) => {
      currentNow = value;
    },
  };
}

function paymentResult() {
  return {
    prepayId: "prepay-1",
    paymentRequest: {
      timeStamp: "1784368800",
      nonceStr: "nonce-1",
      package: "prepay_id=prepay-1",
      signType: "RSA" as const,
      paySign: "pay-sign-1",
    },
  };
}

function secretBundle() {
  return {
    privateKeyPem: "private-key",
    apiV3Key: "api-v3-key",
    wechatPayPublicKeyId: null,
    wechatPayPublicKeyPem: null,
    baseUrl: "https://api.mch.weixin.qq.com",
    revision: "bundle-revision-1",
  };
}

function page<Order>(list: Order[]) {
  return {
    list,
    pagination: { page: 1, pageSize: 20, total: list.length, totalPages: 1 },
  };
}
