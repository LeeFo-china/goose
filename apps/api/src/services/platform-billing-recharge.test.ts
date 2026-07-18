import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  CreditRechargeProductRecord,
  TenantCreditOrderRecord,
  TenantCreditWechatNotificationRecord,
} from "@/repositories/billing-recharge";
import type { PlatformBillingRechargeOrderListItem } from "@/repositories/platform-billing-recharge";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const product = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "credit_1000",
  title: "1000 积分",
  amount_fen: 10000,
  credits: 1000,
  bonus_credits: 100,
  enabled: true,
  sort_order: 10,
  metadata: {},
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
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
  status: "paid",
  paid_at: "2026-07-02T08:05:00.000Z",
  created_by: "employee-1",
  remark: null,
  metadata: {},
  payment_config_id: "platform-config-1",
  out_trade_no: "TC202607020001",
  prepay_id: "prepay-1",
  transaction_id: "4200000000202607020000000001",
  paid_amount_fen: 10000,
  closed_at: null,
  latest_notification_id: "notification-1",
  created_at: "2026-07-02T08:01:00.000Z",
  updated_at: "2026-07-02T08:05:00.000Z",
  tenant: { id: "tenant-1", name: "固始晴天装饰", slug: "qingtian" },
} satisfies PlatformBillingRechargeOrderListItem;

const pendingOrder = {
  ...order,
  status: "pending",
  paid_at: null,
  transaction_id: null,
  paid_amount_fen: 0,
  latest_notification_id: null,
} satisfies PlatformBillingRechargeOrderListItem;

const creditNotification = {
  id: "notification-compensate-1",
  tenant_id: "tenant-1",
  credit_order_id: "order-1",
  notify_id: "query-compensation:4200000000202607020000000001",
  event_type: "TRANSACTION.SUCCESS",
  resource_type: "wechatpay-query",
  raw_payload: {},
  signature_valid: true,
  processed: false,
  processed_at: null,
  error_message: null,
  created_at: "2026-07-02T08:06:00.000Z",
  updated_at: "2026-07-02T08:06:00.000Z",
} satisfies TenantCreditWechatNotificationRecord;

const auditLog = {
  id: "audit-1",
  action: "platform_billing_recharge",
  actor_employee_id: "employee-platform",
  actor_user_id: "auth-platform",
  target_tenant_id: "tenant-1",
  resource_type: "tenant_credit_order",
  resource_id: "order-1",
  resource_label: "TC202607020001",
  status: "success",
  summary: "微信支付查单确认积分充值入账",
  metadata: { out_trade_no: "TC202607020001" },
  created_at: "2026-07-02T08:07:00.000Z",
};

const platformPaymentConfig = {
  id: "platform-config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "好店平台微信商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-platform-app",
  sub_app_id: null,
  encrypted_config_ref: "env://WECHAT_PAY_PLATFORM",
  serial_no: "platform-serial",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-02T08:00:00.000Z",
  updated_at: "2026-07-02T08:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const secretBundle = {
  privateKeyPem: "private-key",
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
  wechatPayPublicKeyPem: "public-key",
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPaySecretBundle;

const platformRole = {
  id: "role-platform",
  code: "platform_admin",
  name: "平台超管",
  description: null,
  status: "active",
} satisfies AuthContext["roles"][number];

const authContext = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [platformRole],
  permissions: [{ code: "platform.billing.recharge_product.manage", scope: "all" }],
} satisfies AuthContext;

const repository = {
  listProducts: mock(async () => ({
    list: [product],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  createProduct: mock(async () => product),
  updateProduct: mock(async () => ({ ...product, enabled: false })),
  upsertProducts: mock(async () => [
    { ...product, code: "credit_1000", title: "体验包" },
    { ...product, id: "00000000-0000-4000-8000-000000000002", code: "credit_3000", title: "标准包" },
    { ...product, id: "00000000-0000-4000-8000-000000000003", code: "credit_5000", title: "成长包" },
    { ...product, id: "00000000-0000-4000-8000-000000000004", code: "credit_10000", title: "专业包" },
    { ...product, id: "00000000-0000-4000-8000-000000000005", code: "credit_30000", title: "企业包" },
  ]),
  listOrders: mock(async () => ({
    list: [order],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  findOrderById: mock(async () => pendingOrder),
  listNotificationsByOrderId: mock(async () => [creditNotification]),
  listAuditLogsByOrderId: mock(async () => [auditLog]),
};

const rechargeRepository = {
  findWechatNotificationByNotifyId: mock(async () => null),
  createWechatNotification: mock(async () => creditNotification),
  markWechatNotificationProcessed: mock(async () => ({
    ...creditNotification,
    processed: true,
  })),
  markWechatNotificationFailed: mock(async () => ({
    ...creditNotification,
    processed: false,
  })),
  confirmWechatRecharge: mock(async () => ({
    order: { ...pendingOrder, status: "paid" },
    account: { id: "account-1", available_credits: 1100 },
    ledger: { id: "ledger-1" },
    recovery: { recovered: true },
    idempotent: false,
  })),
};

const paymentConfigRepository = {
  findWechatPayConfig: mock(async () => platformPaymentConfig),
};

const secretBundleService = {
  load: mock(async () => secretBundle),
};

const wechatPayGateway = {
  queryTransactionByOutTradeNo: mock(async () => ({
    out_trade_no: "TC202607020001",
    transaction_id: "4200000000202607020000000001",
    trade_state: "SUCCESS",
    success_time: "2026-07-02T08:05:00+08:00",
    amount: {
      total: 10000,
      payer_total: 10000,
      currency: "CNY",
    },
  })),
};

const auditLogService = {
  recordBestEffort: mock(async () => null),
};

async function createService() {
  const { PlatformBillingRechargeService } = await import("./platform-billing-recharge");
  return new PlatformBillingRechargeService({
    repository,
    rechargeRepository,
    paymentConfigRepository,
    secretBundleService,
    wechatPayGateway,
    auditLogService,
  });
}

describe("PlatformBillingRechargeService", () => {
  beforeEach(() => {
    for (const fn of [
      ...Object.values(repository),
      ...Object.values(rechargeRepository),
      ...Object.values(paymentConfigRepository),
      ...Object.values(secretBundleService),
      ...Object.values(wechatPayGateway),
      ...Object.values(auditLogService),
    ]) {
      fn.mockClear();
    }
    repository.findOrderById.mockImplementation(async () => pendingOrder);
    rechargeRepository.findWechatNotificationByNotifyId.mockImplementation(async () => null);
    rechargeRepository.confirmWechatRecharge.mockImplementation(async () => ({
      order: { ...pendingOrder, status: "paid" },
      account: { id: "account-1", available_credits: 1100 },
      ledger: { id: "ledger-1" },
      recovery: { recovered: true },
      idempotent: false,
    }));
    paymentConfigRepository.findWechatPayConfig.mockImplementation(async () => platformPaymentConfig);
    secretBundleService.load.mockImplementation(async () => secretBundle);
    wechatPayGateway.queryTransactionByOutTradeNo.mockImplementation(async () => ({
      out_trade_no: "TC202607020001",
      transaction_id: "4200000000202607020000000001",
      trade_state: "SUCCESS",
      success_time: "2026-07-02T08:05:00+08:00",
      amount: {
        total: 10000,
        payer_total: 10000,
        currency: "CNY",
      },
    }));
  });

  test("lists recharge products for platform admins", async () => {
    const service = await createService();

    const result = await service.listProducts(authContext, {
      page: 1,
      pageSize: 20,
    });

    expect(repository.listProducts).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      enabled: undefined,
    });
    expect(result.list[0]?.code).toBe("credit_1000");
  });

  test("creates recharge product with audit employee", async () => {
    const service = await createService();

    await service.createProduct(authContext, {
      code: "credit_1000",
      title: "1000 积分",
      amount_fen: 10000,
      credits: 1000,
      bonus_credits: 100,
      enabled: true,
      sort_order: 10,
      metadata: {},
    });

    expect(repository.createProduct).toHaveBeenCalledWith({
      code: "credit_1000",
      title: "1000 积分",
      amount_fen: 10000,
      credits: 1000,
      bonus_credits: 100,
      enabled: true,
      sort_order: 10,
      metadata: {},
      created_by_employee_id: "employee-platform",
      updated_by_employee_id: "employee-platform",
    });
  });

  test("updates recharge product with audit employee", async () => {
    const service = await createService();

    const result = await service.updateProduct(authContext, product.id, {
      enabled: false,
    });

    expect(repository.updateProduct).toHaveBeenCalledWith(product.id, {
      enabled: false,
      updated_by_employee_id: "employee-platform",
    });
    expect(result.enabled).toBe(false);
  });

  test("lists platform recharge orders", async () => {
    const service = await createService();

    const result = await service.listOrders(authContext, {
      page: 1,
      pageSize: 20,
      status: "paid",
      keyword: "TC202607",
    });

    expect(repository.listOrders).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: "paid",
      keyword: "TC202607",
    });
    expect(result.list[0]?.tenant?.name).toBe("固始晴天装饰");
  });

  test("compensates pending wechat recharge orders from WeChat query", async () => {
    const service = await createService();

    const result = await service.compensateWechatOrder(authContext, pendingOrder.id);

    expect(repository.findOrderById).toHaveBeenCalledWith(pendingOrder.id);
    expect(paymentConfigRepository.findWechatPayConfig).toHaveBeenCalled();
    expect(secretBundleService.load).toHaveBeenCalledWith("env://WECHAT_PAY_PLATFORM");
    expect(wechatPayGateway.queryTransactionByOutTradeNo).toHaveBeenCalledWith({
      config: platformPaymentConfig,
      outTradeNo: "TC202607020001",
      secretBundle,
    });
    expect(rechargeRepository.createWechatNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        credit_order_id: "order-1",
        notify_id: "query-compensation:4200000000202607020000000001",
        event_type: "TRANSACTION.SUCCESS",
        resource_type: "wechatpay-query",
        signature_valid: true,
        processed: false,
      }),
    );
    expect(rechargeRepository.confirmWechatRecharge).toHaveBeenCalledWith({
      orderId: "order-1",
      transactionId: "4200000000202607020000000001",
      paidAmountFen: 10000,
      paidAt: "2026-07-02T08:05:00+08:00",
      notificationId: "notification-compensate-1",
      metadata: {
        compensation_source: "platform_wechat_query",
        compensation_actor_employee_id: "employee-platform",
        compensation_notify_id: "query-compensation:4200000000202607020000000001",
        out_trade_no: "TC202607020001",
      },
    });
    expect(rechargeRepository.confirmWechatRecharge).toHaveBeenCalledTimes(1);
    expect(rechargeRepository.markWechatNotificationProcessed).toHaveBeenCalledWith({
      notificationId: "notification-compensate-1",
    });
    expect(auditLogService.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "platform_billing_recharge",
        targetTenantId: "tenant-1",
        resourceType: "tenant_credit_order",
        resourceId: "order-1",
        status: "success",
      }),
    );
    expect(result).toMatchObject({
      compensated: true,
      trade_state: "SUCCESS",
      notification_id: "notification-compensate-1",
    });
  });

  test("does not mutate pending orders when WeChat query is not paid", async () => {
    wechatPayGateway.queryTransactionByOutTradeNo.mockImplementationOnce(async () => ({
      out_trade_no: "TC202607020001",
      transaction_id: "",
      trade_state: "NOTPAY",
      success_time: "",
      amount: { total: 10000, payer_total: 10000, currency: "CNY" },
    }));
    const service = await createService();

    const result = await service.compensateWechatOrder(authContext, pendingOrder.id);

    expect(rechargeRepository.createWechatNotification).not.toHaveBeenCalled();
    expect(rechargeRepository.confirmWechatRecharge).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      compensated: false,
      trade_state: "NOTPAY",
    });
  });

  test("rejects WeChat query compensation when paid amount does not match order", async () => {
    wechatPayGateway.queryTransactionByOutTradeNo.mockImplementationOnce(async () => ({
      out_trade_no: "TC202607020001",
      transaction_id: "4200000000202607020000000001",
      trade_state: "SUCCESS",
      success_time: "2026-07-02T08:05:00+08:00",
      amount: {
        total: 1,
        payer_total: 1,
        currency: "CNY",
      },
    }));
    const service = await createService();

    await expect(
      service.compensateWechatOrder(authContext, pendingOrder.id),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "BILLING_RECHARGE_QUERY_AMOUNT_MISMATCH",
    });
    expect(rechargeRepository.createWechatNotification).not.toHaveBeenCalled();
    expect(rechargeRepository.confirmWechatRecharge).not.toHaveBeenCalled();
  });

  test("marks compensation notification failed when atomic confirmation rejects", async () => {
    rechargeRepository.confirmWechatRecharge.mockImplementationOnce(async () => {
      throw new Error("atomic confirmation failed");
    });
    const service = await createService();

    await expect(
      service.compensateWechatOrder(authContext, pendingOrder.id),
    ).rejects.toThrow("atomic confirmation failed");

    expect(rechargeRepository.markWechatNotificationFailed).toHaveBeenCalledWith({
      notificationId: creditNotification.id,
      errorMessage: "atomic confirmation failed",
    });
    expect(rechargeRepository.markWechatNotificationProcessed).not.toHaveBeenCalled();
  });

  test("rejects product writes without manage permission", async () => {
    const service = await createService();

    await expect(
      service.createProduct({ ...authContext, permissions: [] }, {
        code: "credit_1000",
        title: "1000 积分",
        amount_fen: 10000,
        credits: 1000,
        bonus_credits: 0,
        enabled: true,
        sort_order: 100,
        metadata: {},
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.createProduct).not.toHaveBeenCalled();
  });
});
