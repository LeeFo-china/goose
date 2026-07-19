import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  TenantCreditOrderRecord,
  TenantCreditWechatNotificationRecord,
} from "@/repositories/billing-recharge";
import type { PaymentRecord } from "@/repositories/payments";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const platformConfig = {
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

const creditOrder = {
  id: "credit-order-1",
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
  prepay_id: "prepay-credit-1",
  transaction_id: null,
  paid_amount_fen: 0,
  closed_at: null,
  latest_notification_id: null,
  created_at: "2026-07-02T08:01:00.000Z",
  updated_at: "2026-07-02T08:01:00.000Z",
} satisfies TenantCreditOrderRecord;

const creditNotification = {
  id: "credit-notification-1",
  tenant_id: "tenant-1",
  credit_order_id: "credit-order-1",
  notify_id: "notify-credit-1",
  event_type: "TRANSACTION.SUCCESS",
  resource_type: "encrypt-resource",
  raw_payload: {},
  signature_valid: true,
  processed: false,
  processed_at: null,
  error_message: null,
  created_at: "2026-07-02T08:05:01.000Z",
  updated_at: "2026-07-02T08:05:01.000Z",
} satisfies TenantCreditWechatNotificationRecord;

const rawBody = JSON.stringify({
  id: "notify-credit-1",
  event_type: "TRANSACTION.SUCCESS",
  resource_type: "encrypt-resource",
  summary: "支付成功",
  resource: {
    nonce: "resource-nonce",
    associated_data: "transaction",
    ciphertext: "ciphertext",
  },
});

const decryptedResource = {
  mchid: platformConfig.merchant_id,
  out_trade_no: "TC202607020001",
  transaction_id: "4200000000202607020000000001",
  trade_state: "SUCCESS",
  success_time: "2026-07-02T08:05:00+08:00",
  amount: {
    total: 10000,
    payer_total: 10000,
    currency: "CNY",
  },
  payer: {
    openid: "o-openid",
  },
};

const listProjectCallbackCandidateConfigs = mock(async () => []);
const listPlatformCallbackCandidateConfigs = mock(async () => [platformConfig]);
const loadSecretBundle = mock(async (): Promise<WechatPaySecretBundle> => ({
  privateKeyPem: "private-key",
  apiV3Key: "12345678901234567890123456789012",
  wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
  wechatPayPublicKeyPem: "public-key",
  baseUrl: "https://api.mch.weixin.qq.com",
}));
const verifySignature = mock(() => true);
const decryptResource = mock((): Record<string, unknown> => decryptedResource);
const findCreditOrderByOutTradeNo = mock(
  async (): Promise<TenantCreditOrderRecord | null> => creditOrder,
);
const findRefundRequestByOutRefundNo = mock(async () => null);
const findCreditNotificationByNotifyId = mock(
  async (): Promise<TenantCreditWechatNotificationRecord | null> => null,
);
const createCreditNotification = mock(
  async (): Promise<TenantCreditWechatNotificationRecord> => creditNotification,
);
const markCreditNotificationProcessed = mock(async () => ({
  ...creditNotification,
  processed: true,
}));
const markCreditNotificationFailed = mock(async () => ({
  ...creditNotification,
  processed: false,
}));
const confirmWechatRecharge = mock(async () => ({
  order: { ...creditOrder, status: "paid" },
  account: { id: "account-1", available_credits: 3100 },
  ledger: { id: "ledger-1" },
  recovery: { recovered: true },
  idempotent: false,
}));
const confirmRechargePayment = mock(async () => ({
  order: { ...creditOrder, status: "paid" },
  account: { id: "account-1", available_credits: 3100 },
  ledger: { id: "ledger-1" },
  recovery: { recovered: true },
  idempotent: true,
}));
const confirmWechatRechargeRefund = mock(async () => ({
  request: {},
  order: {},
  account: { id: "account-1", available_credits: 2000 },
  ledger: { id: "refund-ledger-1" },
  idempotent: false,
}));
const applyWechatRechargeRefundCallbackState = mock(async () => true);
const createPayment = mock(async (): Promise<PaymentRecord> => {
  throw new Error("project payment should not be created for credit recharge");
});
const completePaymentTask = mock(async () => {
  throw new Error("workflow task should not complete for credit recharge");
});

async function createService(input: {
  rechargePaymentConfirmation?: { confirm: typeof confirmRechargePayment };
} = {}) {
  const { WechatPayCallbackService } = await import("./wechat-pay-callbacks");
  return new WechatPayCallbackService({
    configRepository: {
      listCallbackCandidateConfigs: listProjectCallbackCandidateConfigs,
    },
    platformConfigRepository: {
      listCallbackCandidateConfigs: listPlatformCallbackCandidateConfigs,
    },
    secretBundleService: { load: loadSecretBundle },
    crypto: { verifySignature, decryptResource },
    creditRechargeRepository: {
      findWechatOrderByOutTradeNo: findCreditOrderByOutTradeNo,
      findWechatRefundRequestByOutRefundNo: findRefundRequestByOutRefundNo,
      findWechatNotificationByNotifyId: findCreditNotificationByNotifyId,
      createWechatNotification: createCreditNotification,
      markWechatNotificationProcessed: markCreditNotificationProcessed,
      markWechatNotificationFailed: markCreditNotificationFailed,
      confirmWechatRecharge,
      confirmWechatRechargeRefund,
      applyWechatRechargeRefundCallbackState,
    },
    paymentRepository: { create: createPayment },
    paymentBridge: { complete: completePaymentTask },
    rechargePaymentConfirmation: input.rechargePaymentConfirmation,
  });
}

describe("WechatPayCallbackService credit recharge callbacks", () => {
  beforeEach(() => {
    for (const fn of [
      listProjectCallbackCandidateConfigs,
      listPlatformCallbackCandidateConfigs,
      loadSecretBundle,
      verifySignature,
      decryptResource,
      findCreditOrderByOutTradeNo,
      findRefundRequestByOutRefundNo,
      findCreditNotificationByNotifyId,
      createCreditNotification,
      markCreditNotificationProcessed,
      markCreditNotificationFailed,
      confirmWechatRecharge,
      confirmWechatRechargeRefund,
      applyWechatRechargeRefundCallbackState,
      confirmRechargePayment,
      createPayment,
      completePaymentTask,
    ]) {
      fn.mockClear();
    }
    verifySignature.mockImplementation(() => true);
    decryptResource.mockImplementation(() => decryptedResource);
    findCreditOrderByOutTradeNo.mockImplementation(async () => creditOrder);
    findRefundRequestByOutRefundNo.mockImplementation(async () => null);
    findCreditNotificationByNotifyId.mockImplementation(async () => null);
  });

  test("processes successful platform credit recharge callback into billing account", async () => {
    const service = await createService();

    const result = await service.handleCallback({
      rawBody,
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
        "wechatpay-serial": "PUB_KEY_ID_TEST",
      },
    });

    expect(result).toEqual({ code: "SUCCESS", message: "成功" });
    expect(findCreditOrderByOutTradeNo).toHaveBeenCalledWith("TC202607020001");
    expect(createCreditNotification).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      credit_order_id: "credit-order-1",
      notify_id: "notify-credit-1",
      signature_valid: true,
    }));
    expect(confirmWechatRecharge).toHaveBeenCalledWith({
      orderId: "credit-order-1",
      transactionId: "4200000000202607020000000001",
      paidAmountFen: 10000,
      paidAt: "2026-07-02T08:05:00+08:00",
      notificationId: "credit-notification-1",
      metadata: {
        confirmation_source: "wechat_callback",
        out_trade_no: "TC202607020001",
      },
    });
    expect(confirmWechatRecharge).toHaveBeenCalledTimes(1);
    expect(markCreditNotificationProcessed).toHaveBeenCalledWith({
      notificationId: "credit-notification-1",
    });
    expect(createPayment).not.toHaveBeenCalled();
    expect(completePaymentTask).not.toHaveBeenCalled();
  });

  test("returns success without recharge side effects for duplicate processed notification", async () => {
    findCreditNotificationByNotifyId.mockImplementationOnce(async () => ({
      ...creditNotification,
      processed: true,
    }));
    const service = await createService({
      rechargePaymentConfirmation: { confirm: confirmRechargePayment },
    });

    const result = await service.handleCallback({
      rawBody,
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
      },
    });

    expect(result).toEqual({ code: "SUCCESS", message: "成功" });
    expect(createCreditNotification).not.toHaveBeenCalled();
    expect(confirmRechargePayment).not.toHaveBeenCalled();
    expect(confirmWechatRecharge).not.toHaveBeenCalled();
    expect(markCreditNotificationProcessed).not.toHaveBeenCalled();
  });

  test("retries atomic recovery for a paid recharge with a new notification", async () => {
    findCreditOrderByOutTradeNo.mockImplementationOnce(async () => ({
      ...creditOrder,
      status: "paid",
      transaction_id: "4200000000202607020000000001",
      paid_amount_fen: creditOrder.amount_fen,
      paid_at: "2026-07-02T08:05:00+08:00",
      latest_notification_id: "credit-notification-old",
    }));
    createCreditNotification.mockImplementationOnce(async () => ({
      ...creditNotification,
      id: "credit-notification-new",
      notify_id: "notify-credit-new",
    }));
    const service = await createService({
      rechargePaymentConfirmation: { confirm: confirmRechargePayment },
    });

    const result = await service.handleCallback({
      rawBody: JSON.stringify({
        ...JSON.parse(rawBody),
        id: "notify-credit-new",
      }),
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
      },
    });

    expect(result).toEqual({ code: "SUCCESS", message: "成功" });
    expect(createCreditNotification).toHaveBeenCalledWith(expect.objectContaining({
      notify_id: "notify-credit-new",
      processed: false,
    }));
    expect(confirmRechargePayment).toHaveBeenCalledTimes(1);
    expect(confirmRechargePayment).toHaveBeenCalledWith(expect.objectContaining({
      notificationId: "credit-notification-new",
      source: "wechat_callback",
    }));
    expect(markCreditNotificationProcessed).toHaveBeenCalledWith({
      notificationId: "credit-notification-new",
    });
  });

  test("retries atomic recovery for a paid recharge failed notification", async () => {
    findCreditOrderByOutTradeNo.mockImplementationOnce(async () => ({
      ...creditOrder,
      status: "paid",
      transaction_id: decryptedResource.transaction_id,
      paid_amount_fen: creditOrder.amount_fen,
    }));
    findCreditNotificationByNotifyId.mockImplementationOnce(async () => ({
      ...creditNotification,
      error_message: "previous atomic recovery failed",
    }));
    const service = await createService({
      rechargePaymentConfirmation: { confirm: confirmRechargePayment },
    });

    await service.handleCallback({
      rawBody,
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
      },
    });

    expect(createCreditNotification).not.toHaveBeenCalled();
    expect(confirmRechargePayment).toHaveBeenCalledTimes(1);
    expect(markCreditNotificationProcessed).toHaveBeenCalledWith({
      notificationId: creditNotification.id,
    });
  });

  test("rejects TRANSACTION.SUCCESS callback with a non-success trade state", async () => {
    decryptResource.mockImplementationOnce(() => ({
      ...decryptedResource,
      trade_state: "NOTPAY",
    }));
    const service = await createService();

    await expect(service.handleCallback({
      rawBody,
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
      },
    })).rejects.toMatchObject({
      code: "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH",
    });

    expect(confirmWechatRecharge).not.toHaveBeenCalled();
    expect(createCreditNotification).not.toHaveBeenCalled();
    expect(markCreditNotificationProcessed).not.toHaveBeenCalled();
  });

  test("marks the notification failed when atomic confirmation rejects", async () => {
    confirmWechatRecharge.mockImplementationOnce(async () => {
      throw new Error("confirm failed");
    });
    const service = await createService();

    await expect(service.handleCallback({
      rawBody,
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
      },
    })).rejects.toThrow("confirm failed");

    expect(confirmWechatRecharge).toHaveBeenCalledTimes(1);
    expect(markCreditNotificationFailed).toHaveBeenCalledWith({
      notificationId: "credit-notification-1",
      errorMessage: "confirm failed",
    });
    expect(markCreditNotificationProcessed).not.toHaveBeenCalled();
  });

  test("rejects equal-amount callback replay from another merchant before credit", async () => {
    decryptResource.mockImplementationOnce(() => ({
      ...decryptedResource,
      mchid: "different-merchant",
    }));
    const service = await createService();

    await expect(service.handleCallback({
      rawBody,
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
      },
    })).rejects.toMatchObject({
      code: "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH",
    });
    expect(confirmWechatRecharge).not.toHaveBeenCalled();
    expect(confirmRechargePayment).not.toHaveBeenCalled();
  });

});
