import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { BrandingAddonCallbackOrderRecord } from "@/repositories/branding-addon-orders";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { OrderRecord } from "@/repositories/platform-service-order-records";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const config = {
  id: "platform-config-service",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台普通商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-platform-service",
  sub_app_id: null,
  encrypted_config_ref: "env://WECHAT_PAY_PLATFORM",
  secret_bundle_revision: "bundle-revision-1",
  serial_no: "platform-serial",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["platform_service"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  recharge_guard_version: 7,
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-08-03T08:00:00.000Z",
  updated_at: "2026-08-03T08:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const serviceOrder = {
  id: "service-order-1",
  tenant_id: "tenant-1",
  order_no: "TSO202608030001",
  out_trade_no: "TSO202608030001",
  product_code: "platform_service_1y",
  term_years: 1,
  amount_fen: 980000,
  payment_status: "pending",
  service_status: "waiting_payment",
  payment_config_id: config.id,
  payment_config_guard_version: 7,
  payer_openid: "openid-1",
  prepay_id: "prepay-1",
  transaction_id: null,
  payment_expires_at: "2026-08-03T08:05:00.000Z",
  paid_at: null,
  closed_at: null,
  terms_version: 1,
  version: 1,
  created_at: "2026-08-03T08:00:00.000Z",
  updated_at: "2026-08-03T08:00:00.000Z",
} satisfies OrderRecord;

const notification = {
  id: "service-notification-1",
  notify_id: "notify-service-1",
  tenant_id: serviceOrder.tenant_id,
  order_id: serviceOrder.id,
  out_trade_no: serviceOrder.out_trade_no,
  transaction_id: "4200000000202608030000000001",
  payload: {},
  processed: false,
  processed_at: null,
  error_message: null,
  created_at: "2026-08-03T08:01:01.000Z",
  updated_at: "2026-08-03T08:01:01.000Z",
};

const secretBundle = {
  privateKeyPem: "private-key",
  apiV3Key: "12345678901234567890123456789012",
  wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
  wechatPayPublicKeyPem: "public-key",
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "bundle-revision-1",
} satisfies WechatPaySecretBundle;

const resource = {
  appid: config.app_id,
  mchid: config.merchant_id,
  out_trade_no: serviceOrder.out_trade_no,
  transaction_id: "4200000000202608030000000001",
  trade_state: "SUCCESS",
  success_time: "2026-08-03T08:01:00+08:00",
  amount: { total: 980000, payer_total: 980000, currency: "CNY" },
  payer: { openid: "openid-1" },
};

const rawBody = JSON.stringify({
  id: notification.notify_id,
  event_type: "TRANSACTION.SUCCESS",
  resource_type: "encrypt-resource",
  summary: "支付成功",
  resource: {
    nonce: "resource-nonce",
    associated_data: "transaction",
    ciphertext: "ciphertext",
  },
});

const listProjectConfigs = mock(async () => []);
const listPlatformConfigs = mock(async () => [config]);
const loadSecretBundle = mock(async () => secretBundle);
const verifySignature = mock(() => true);
const decryptResource = mock((): Record<string, unknown> => resource);
const findCreditOrder = mock(
  async (): Promise<TenantCreditOrderRecord | null> => null,
);
const findCreditRefund = mock(async () => null);
const findBrandingOrder = mock(
  async (): Promise<BrandingAddonCallbackOrderRecord | null> => null,
);
const findServiceOrder = mock(async (): Promise<OrderRecord | null> =>
  serviceOrder
);
const findNotification = mock(async () => null as typeof notification | null);
const createNotification = mock(async () => notification);
const markProcessed = mock(async () => undefined);
const markFailed = mock(async () => undefined);
const confirmService = mock(async () => ({
  order: { id: serviceOrder.id, payment_status: "paid" },
  work_order: { id: "work-order-1" },
  idempotent: false,
}));
const unexpectedCreditRepositoryOperation = mock(async (): Promise<never> => {
  throw new Error("credit repository must not run");
});
const unexpectedBrandingRepositoryOperation = mock(async (): Promise<never> => {
  throw new Error("branding repository must not run");
});
const unexpectedCreditConfirm = mock(async (): Promise<never> => {
  throw new Error("credit confirmation must not run");
});
const unexpectedBrandingConfirm = mock(async (): Promise<never> => {
  throw new Error("branding confirmation must not run");
});
const unexpectedProjectPayment = mock(async (): Promise<never> => {
  throw new Error("project payment must not run");
});

async function createService() {
  const { WechatPayCallbackService } = await import("./wechat-pay-callbacks");
  return new WechatPayCallbackService({
    configRepository: { listCallbackCandidateConfigs: listProjectConfigs },
    platformConfigRepository: {
      listCallbackCandidateConfigs: listPlatformConfigs,
    },
    secretBundleService: { load: loadSecretBundle },
    crypto: { verifySignature, decryptResource },
    creditRechargeRepository: {
      findWechatOrderByOutTradeNo: findCreditOrder,
      findWechatRefundRequestByOutRefundNo: findCreditRefund,
      findWechatNotificationByNotifyId: unexpectedCreditRepositoryOperation,
      createWechatNotification: unexpectedCreditRepositoryOperation,
      markWechatNotificationProcessed: unexpectedCreditRepositoryOperation,
      markWechatNotificationFailed: unexpectedCreditRepositoryOperation,
      confirmWechatRecharge: unexpectedCreditRepositoryOperation,
      confirmWechatRechargeRefund: unexpectedCreditRepositoryOperation,
      applyWechatRechargeRefundCallbackState: mock(async () => true),
    },
    brandingAddonMatchRepository: { findByOutTradeNo: findBrandingOrder },
    brandingAddonOrderRepository: {
      findNotificationByNotifyId: unexpectedBrandingRepositoryOperation,
      createNotification: unexpectedBrandingRepositoryOperation,
      markNotificationProcessed: unexpectedBrandingRepositoryOperation,
      markNotificationFailed: unexpectedBrandingRepositoryOperation,
    },
    brandingAddonPaymentConfirmation: { confirm: unexpectedBrandingConfirm },
    platformServiceOrderMatchRepository: {
      findOrderByOutTradeNo: findServiceOrder,
    },
    platformServiceOrderRepository: {
      findWechatNotificationByNotifyId: findNotification,
      createWechatNotification: createNotification,
      markWechatNotificationProcessed: markProcessed,
      markWechatNotificationFailed: markFailed,
    },
    platformServiceOrderPaymentConfirmation: { confirm: confirmService },
    rechargePaymentConfirmation: { confirm: unexpectedCreditConfirm },
    paymentRepository: { create: unexpectedProjectPayment },
    paymentBridge: { complete: unexpectedProjectPayment },
  });
}

describe("WechatPayCallbackService platform service callbacks", () => {
  beforeEach(() => {
    for (const fn of [
      listProjectConfigs,
      listPlatformConfigs,
      loadSecretBundle,
      verifySignature,
      decryptResource,
      findCreditOrder,
      findCreditRefund,
      findBrandingOrder,
      findServiceOrder,
      findNotification,
      createNotification,
      markProcessed,
      markFailed,
      confirmService,
      unexpectedCreditRepositoryOperation,
      unexpectedBrandingRepositoryOperation,
      unexpectedCreditConfirm,
      unexpectedBrandingConfirm,
      unexpectedProjectPayment,
    ]) {
      fn.mockClear();
    }
    decryptResource.mockImplementation(() => resource);
    findCreditOrder.mockImplementation(async () => null);
    findBrandingOrder.mockImplementation(async () => null);
    findServiceOrder.mockImplementation(async () => serviceOrder);
    findNotification.mockImplementation(async () => null);
  });

  test("matches a service order only to its bound platform payment config", async () => {
    const service = await createService();

    const result = await service.handleCallback({
      rawBody,
      headers: callbackHeaders(),
    });

    expect(result).toEqual({ code: "SUCCESS", message: "成功" });
    expect(findServiceOrder).toHaveBeenCalledWith("TSO202608030001");
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: serviceOrder.tenant_id,
      orderId: serviceOrder.id,
      outTradeNo: serviceOrder.out_trade_no,
    }));
  });

  test("rejects amount, merchant, appid and transaction binding mismatches", async () => {
    const service = await createService();
    for (const badResource of [
      { ...resource, amount: { total: 1, currency: "CNY" } },
      { ...resource, mchid: "1900000002" },
      { ...resource, appid: "wx-other" },
      { ...resource, transaction_id: "4200000000202608039999999999" },
    ]) {
      decryptResource.mockImplementationOnce(() => badResource);
      findServiceOrder.mockImplementationOnce(async () => ({
        ...serviceOrder,
        transaction_id: resource.transaction_id,
      }));
      await expect(service.handleCallback({
        rawBody,
        headers: callbackHeaders(),
      })).rejects.toMatchObject({
        code: "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH",
      });
    }
  });

  test("rejects an out_trade_no shared by two platform payment domains", async () => {
    findCreditOrder.mockImplementationOnce(async () => ({
      id: "credit-order-1",
      tenant_id: "tenant-1",
      order_no: serviceOrder.out_trade_no!,
      idempotency_key: "idem",
      package_code: "credit_1000",
      credits: 1000,
      amount_fen: serviceOrder.amount_fen,
      bonus_credits: 0,
      channel: "wechat_pay",
      status: "pending",
      paid_at: null,
      created_by: "employee-1",
      remark: null,
      metadata: {},
      payment_config_id: config.id,
      out_trade_no: serviceOrder.out_trade_no!,
      prepay_id: "prepay-credit",
      transaction_id: null,
      paid_amount_fen: 0,
      closed_at: null,
      latest_notification_id: null,
      created_at: serviceOrder.created_at,
      updated_at: serviceOrder.updated_at,
    }));
    const service = await createService();

    await expect(service.handleCallback({
      rawBody,
      headers: callbackHeaders(),
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_CALLBACK_ORDER_AMBIGUOUS",
    });
  });

  test("confirms payment and creates one work order", async () => {
    const service = await createService();

    await service.handleCallback({ rawBody, headers: callbackHeaders() });

    expect(confirmService).toHaveBeenCalledWith({
      order: serviceOrder,
      transaction: expect.objectContaining({
        transactionId: resource.transaction_id,
        amountFen: 980000,
      }),
      notificationId: notification.id,
      source: "wechat_callback",
    });
    expect(markProcessed).toHaveBeenCalledWith(notification.id);
  });

  test("returns success for a duplicate processed notify id", async () => {
    findNotification.mockImplementationOnce(async () => ({
      ...notification,
      processed: true,
    }));
    const service = await createService();

    const result = await service.handleCallback({
      rawBody,
      headers: callbackHeaders(),
    });

    expect(result).toEqual({ code: "SUCCESS", message: "成功" });
    expect(confirmService).not.toHaveBeenCalled();
  });

  test("does not invoke credit, branding virtual or project payment confirmation", async () => {
    const service = await createService();

    await service.handleCallback({ rawBody, headers: callbackHeaders() });

    expect(unexpectedCreditConfirm).not.toHaveBeenCalled();
    expect(unexpectedBrandingConfirm).not.toHaveBeenCalled();
    expect(unexpectedProjectPayment).not.toHaveBeenCalled();
  });
});

function callbackHeaders() {
  return {
    "wechatpay-timestamp": "1782873600",
    "wechatpay-nonce": "callback-nonce",
    "wechatpay-signature": "signature",
    "wechatpay-serial": "PUB_KEY_ID_TEST",
  };
}
