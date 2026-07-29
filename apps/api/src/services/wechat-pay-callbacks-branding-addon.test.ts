import { beforeEach, describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type {
  BrandingAddonCallbackOrderRecord,
  BrandingConfirmPurchaseResult,
  BrandingAddonWechatNotificationRecord,
} from "@/repositories/branding-addon-orders";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const config = {
  id: "platform-config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台普通商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-branding-app",
  sub_app_id: null,
  encrypted_config_ref: "env://WECHAT_PAY_PLATFORM",
  secret_bundle_revision: "bundle-revision-1",
  serial_no: "platform-serial",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  recharge_guard_version: 2,
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-28T08:00:00.000Z",
  updated_at: "2026-07-28T08:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const order = {
  id: "addon-order-1",
  tenant_id: "tenant-1",
  order_no: "BA202607280001",
  out_trade_no: "BA202607280001",
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  amount_fen: 1,
  term_years: 1,
  status: "pending",
  payment_config_id: config.id,
  payment_mchid: config.merchant_id,
  payment_appid: config.app_id,
  payment_expires_at: "2026-07-28T08:05:00.000Z",
  transaction_id: null,
  paid_amount_fen: null,
  paid_at: null,
  entitlement_event_id: null,
  created_at: "2026-07-28T08:00:00.000Z",
  updated_at: "2026-07-28T08:00:00.000Z",
} satisfies BrandingAddonCallbackOrderRecord & { payment_config_id: string };

const collidingCreditOrder = {
  id: "credit-order-1",
  tenant_id: "tenant-1",
  order_no: order.out_trade_no,
  idempotency_key: "idem-credit-1",
  package_code: "credit_1000",
  credits: 1000,
  amount_fen: order.amount_fen,
  bonus_credits: 0,
  channel: "wechat_pay",
  status: "pending",
  paid_at: null,
  created_by: "employee-1",
  remark: null,
  metadata: {},
  payment_config_id: config.id,
  out_trade_no: order.out_trade_no,
  prepay_id: "prepay-credit-1",
  transaction_id: null,
  paid_amount_fen: 0,
  closed_at: null,
  latest_notification_id: null,
  created_at: order.created_at,
  updated_at: order.updated_at,
} satisfies TenantCreditOrderRecord;

const notification = {
  id: "addon-notification-1",
  notify_id: "notify-addon-1",
  tenant_id: order.tenant_id,
  order_id: order.id,
  event_type: "TRANSACTION.SUCCESS",
  resource_type: "encrypt-resource",
  raw_payload: {},
  signature_valid: true,
  processed: false,
  processed_at: null,
  error_message: null,
  created_at: "2026-07-28T08:01:01.000Z",
  updated_at: "2026-07-28T08:01:01.000Z",
} satisfies BrandingAddonWechatNotificationRecord;

const secretBundle = {
  privateKeyPem: "private-key",
  apiV3Key: "12345678901234567890123456789012",
  wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
  wechatPayPublicKeyPem: "public-key",
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "bundle-revision-1",
} satisfies WechatPaySecretBundle;

const successfulResource = {
  appid: config.app_id,
  mchid: config.merchant_id,
  out_trade_no: order.out_trade_no,
  transaction_id: "4200000000202607280000000001",
  trade_state: "SUCCESS",
  success_time: "2026-07-28T08:01:00+08:00",
  amount: { total: 1, payer_total: 1, currency: "CNY" },
  payer: { openid: "openid-1" },
};

const candidateLoaderCalls: string[] = [];
const listProjectConfigs = mock(async () => {
  candidateLoaderCalls.push("tenant");
  return [];
});
const listPlatformConfigs = mock(async () => {
  candidateLoaderCalls.push("platform");
  return [config];
});
const loadSecretBundle = mock(async () => secretBundle);
const verifySignature = mock(() => true);
const decryptResource = mock(
  (): Record<string, unknown> => successfulResource,
);
const findAddonOrder = mock(
  async (): Promise<typeof order | null> => order,
);
const findCreditOrder = mock(
  async (): Promise<TenantCreditOrderRecord | null> => null,
);
const findCreditRefund = mock(async () => null);
const unexpectedCreditOperation = mock(async (): Promise<never> => {
  throw new Error("credit callback repository must not run");
});
const findAddonNotification = mock(
  async (): Promise<BrandingAddonWechatNotificationRecord | null> => null,
);
const createAddonNotification = mock(
  async (): Promise<BrandingAddonWechatNotificationRecord> => notification,
);
const markAddonNotificationProcessed = mock(async () => ({
  ...notification,
  processed: true,
}));
const markAddonNotificationFailed = mock(async () => ({
  ...notification,
  processed: false,
}) as BrandingAddonWechatNotificationRecord | null);
const confirmAddonPurchase = mock(
  async (): Promise<BrandingConfirmPurchaseResult> => ({
  idempotent: false,
  order: null,
  entitlement: { status: "active" },
  event: { id: "event-1" },
  source_type: "purchase" as const,
  }),
);
const confirmRecharge = mock(async () => {
  throw new Error("credit confirmation must not run");
});
const createProjectPayment = mock(async () => {
  throw new Error("project payment must not run");
});
const completeProjectPayment = mock(async () => {
  throw new Error("project payment bridge must not run");
});

function callbackBody(
  notifyId = notification.notify_id,
  eventType = notification.event_type,
) {
  return JSON.stringify({
    id: notifyId,
    event_type: eventType,
    resource_type: "encrypt-resource",
    summary: "支付成功",
    resource: {
      nonce: "resource-nonce",
      associated_data: "transaction",
      ciphertext: "secret-ciphertext",
    },
  });
}

async function createService() {
  const { WechatPayCallbackService } = await import("./wechat-pay-callbacks");
  return new WechatPayCallbackService({
    configRepository: {
      listCallbackCandidateConfigs: listProjectConfigs,
    },
    platformConfigRepository: {
      listCallbackCandidateConfigs: listPlatformConfigs,
    },
    secretBundleService: { load: loadSecretBundle },
    crypto: { verifySignature, decryptResource },
    brandingAddonMatchRepository: {
      findByOutTradeNo: findAddonOrder,
    },
    creditRechargeRepository: {
      findWechatOrderByOutTradeNo: findCreditOrder,
      findWechatRefundRequestByOutRefundNo: findCreditRefund,
      findWechatNotificationByNotifyId: unexpectedCreditOperation,
      createWechatNotification: unexpectedCreditOperation,
      markWechatNotificationProcessed: unexpectedCreditOperation,
      markWechatNotificationFailed: unexpectedCreditOperation,
      confirmWechatRecharge: unexpectedCreditOperation,
      confirmWechatRechargeRefund: unexpectedCreditOperation,
      applyWechatRechargeRefundCallbackState: unexpectedCreditOperation,
    },
    brandingAddonOrderRepository: {
      findNotificationByNotifyId: findAddonNotification,
      createNotification: createAddonNotification,
      markNotificationProcessed: markAddonNotificationProcessed,
      markNotificationFailed: markAddonNotificationFailed,
    },
    brandingAddonPaymentConfirmation: {
      confirm: confirmAddonPurchase,
    },
    rechargePaymentConfirmation: { confirm: confirmRecharge },
    paymentRepository: { create: createProjectPayment },
    paymentBridge: { complete: completeProjectPayment },
  });
}

const callbackHeaders = {
  "wechatpay-timestamp": "1785196860",
  "wechatpay-nonce": "callback-nonce",
  "wechatpay-signature": "signature",
  "wechatpay-serial": "PUB_KEY_ID_TEST",
};

describe("WechatPayCallbackService branding add-on callbacks", () => {
  beforeEach(() => {
    candidateLoaderCalls.length = 0;
    for (const fn of [
      listProjectConfigs,
      listPlatformConfigs,
      loadSecretBundle,
      verifySignature,
      decryptResource,
      findAddonOrder,
      findCreditOrder,
      findCreditRefund,
      unexpectedCreditOperation,
      findAddonNotification,
      createAddonNotification,
      markAddonNotificationProcessed,
      markAddonNotificationFailed,
      confirmAddonPurchase,
      confirmRecharge,
      createProjectPayment,
      completeProjectPayment,
    ]) {
      fn.mockClear();
    }
    verifySignature.mockImplementation(() => true);
    decryptResource.mockImplementation(() => successfulResource);
    findAddonOrder.mockImplementation(async () => order);
    findCreditOrder.mockImplementation(async () => null);
    findCreditRefund.mockImplementation(async () => null);
    findAddonNotification.mockImplementation(async () => null);
    confirmAddonPurchase.mockImplementation(async () => ({
      idempotent: false,
      order: null,
      entitlement: { status: "active" },
      event: { id: "event-1" },
      source_type: "purchase" as const,
    }));
  });

  test("matches the exact order and confirms it through its bound config", async () => {
    const service = await createService();
    const rawBody = callbackBody();

    expect(await service.handleCallback({
      rawBody,
      headers: callbackHeaders,
    })).toEqual({ code: "SUCCESS", message: "成功" });

    expect(verifySignature).toHaveBeenCalledWith(expect.objectContaining({
      rawBody,
      publicKeyPem: secretBundle.wechatPayPublicKeyPem,
    }));
    expect(loadSecretBundle).toHaveBeenCalledWith(config.encrypted_config_ref);
    expect(findAddonOrder).toHaveBeenCalledWith(order.out_trade_no);
    expect(listProjectConfigs).not.toHaveBeenCalled();
    expect(candidateLoaderCalls).toEqual(["platform"]);
    expect(confirmAddonPurchase).toHaveBeenCalledWith({
      order: expect.objectContaining({ id: order.id }),
      transaction: expect.objectContaining({
        appid: order.payment_appid,
        merchantId: order.payment_mchid,
        outTradeNo: order.out_trade_no,
        transactionId: successfulResource.transaction_id,
        amountFen: order.amount_fen,
        successTime: successfulResource.success_time,
      }),
      notificationId: notification.id,
      source: "wechat_callback",
    });
    expect(markAddonNotificationProcessed).toHaveBeenCalledWith({
      notificationId: notification.id,
    });
    expect(confirmRecharge).not.toHaveBeenCalled();
    expect(createProjectPayment).not.toHaveBeenCalled();
    expect(completeProjectPayment).not.toHaveBeenCalled();
  });

  test("fast-success replay requires the same notification identity", async () => {
    findAddonNotification.mockImplementationOnce(async () => ({
      ...notification,
      processed: true,
    }));
    const service = await createService();

    expect(await service.handleCallback({
      rawBody: callbackBody(),
      headers: callbackHeaders,
    })).toEqual({ code: "SUCCESS", message: "成功" });
    expect(confirmAddonPurchase).not.toHaveBeenCalled();
    expect(createAddonNotification).not.toHaveBeenCalled();

    findAddonNotification.mockImplementationOnce(async () => ({
      ...notification,
      processed: true,
      tenant_id: "tenant-other",
    }));
    await expect(service.handleCallback({
      rawBody: callbackBody(),
      headers: callbackHeaders,
    })).rejects.toMatchObject({
      code: "BRANDING_ADDON_NOTIFICATION_ID_COLLISION",
    });
  });

  test("rejects an out-trade-no that matches credit and add-on orders", async () => {
    findCreditOrder.mockImplementationOnce(async () => collidingCreditOrder);
    const service = await createService();

    await expect(service.handleCallback({
      rawBody: callbackBody(),
      headers: callbackHeaders,
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_CALLBACK_ORDER_AMBIGUOUS",
    });
    expect(confirmAddonPurchase).not.toHaveBeenCalled();
    expect(createAddonNotification).not.toHaveBeenCalled();
  });

  test("ignores an out-trade-no match bound to another payment config", async () => {
    findCreditOrder.mockImplementationOnce(async () => ({
      ...collidingCreditOrder,
      payment_config_id: "different-config",
    }));
    const service = await createService();

    expect(await service.handleCallback({
      rawBody: callbackBody(),
      headers: callbackHeaders,
    })).toEqual({ code: "SUCCESS", message: "成功" });
    expect(confirmAddonPurchase).toHaveBeenCalledTimes(1);
    expect(markAddonNotificationProcessed).toHaveBeenCalledTimes(1);
  });

  test("rejects a success notification without a resource type", async () => {
    const payload = JSON.parse(callbackBody()) as Record<string, unknown>;
    delete payload.resource_type;
    const service = await createService();

    await expect(service.handleCallback({
      rawBody: JSON.stringify(payload),
      headers: callbackHeaders,
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createAddonNotification).not.toHaveBeenCalled();
    expect(confirmAddonPurchase).not.toHaveBeenCalled();
  });

  test.each([
    ["event_type", {}, "TRANSACTION.CLOSED"],
    ["trade_state", { trade_state: "NOTPAY" }, "TRANSACTION.SUCCESS"],
    ["amount", { amount: { total: 2, currency: "CNY" } }, "TRANSACTION.SUCCESS"],
    ["mchid", { mchid: "other-mchid" }, "TRANSACTION.SUCCESS"],
    ["appid", { appid: "other-appid" }, "TRANSACTION.SUCCESS"],
    ["out_trade_no", { out_trade_no: "other-trade" }, "TRANSACTION.SUCCESS"],
  ])("rejects callback %s mismatch before confirmation", async (
    field,
    patch,
    eventType,
  ) => {
    decryptResource.mockImplementationOnce(() => ({
      ...successfulResource,
      ...patch,
    }));
    const service = await createService();

    await expect(service.handleCallback({
      rawBody: callbackBody(notification.notify_id, eventType),
      headers: callbackHeaders,
    })).rejects.toMatchObject({
      code: field === "amount"
        ? "BRANDING_ADDON_CALLBACK_AMOUNT_MISMATCH"
        : "BRANDING_ADDON_CALLBACK_CONTEXT_MISMATCH",
    });
    expect(confirmAddonPurchase).not.toHaveBeenCalled();
    expect(createAddonNotification).not.toHaveBeenCalled();
  });

  test("retries an unprocessed notification and stores only a safe bounded error", async () => {
    findAddonNotification.mockImplementation(async () => ({
      ...notification,
      processed: false,
      error_message: "previous failure",
    }));
    confirmAddonPurchase
      .mockImplementationOnce(async () => {
        throw new Error(`database secret ${"x".repeat(600)}`);
      })
      .mockImplementationOnce(async () => ({
        idempotent: true,
        order: null,
        entitlement: { status: "active" },
        event: { id: "event-1" },
        source_type: "purchase" as const,
      }));
    const service = await createService();

    await expect(service.handleCallback({
      rawBody: callbackBody(),
      headers: callbackHeaders,
    })).rejects.toThrow();
    expect(markAddonNotificationFailed).toHaveBeenCalledWith({
      notificationId: notification.id,
      errorMessage: "品牌权益支付回调处理失败",
    });
    expect(createAddonNotification).not.toHaveBeenCalled();

    expect(await service.handleCallback({
      rawBody: callbackBody(),
      headers: callbackHeaders,
    })).toEqual({ code: "SUCCESS", message: "成功" });
    expect(confirmAddonPurchase).toHaveBeenCalledTimes(2);
  });

  test("preserves stable transaction conflicts and never overwrites processed state", async () => {
    confirmAddonPurchase.mockImplementationOnce(async () => {
      throw Errors.business(
        409,
        "微信支付订单号冲突",
        "BRANDING_ADDON_TRANSACTION_CONFLICT",
      );
    });
    markAddonNotificationFailed.mockImplementationOnce(async () => null);
    const service = await createService();

    await expect(service.handleCallback({
      rawBody: callbackBody(),
      headers: callbackHeaders,
    })).rejects.toMatchObject({
      code: "BRANDING_ADDON_TRANSACTION_CONFLICT",
    });
    expect(markAddonNotificationFailed).toHaveBeenCalledWith({
      notificationId: notification.id,
      errorMessage: "微信支付订单号冲突",
    });
    expect(markAddonNotificationProcessed).not.toHaveBeenCalled();
  });
});
