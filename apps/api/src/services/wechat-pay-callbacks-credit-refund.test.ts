import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  TenantCreditOrderRecord,
  TenantCreditWechatNotificationRecord,
} from "@/repositories/billing-recharge";
import type { TenantCreditRefundRequestRecord } from "@/repositories/billing-recharge-refunds";
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
  status: "paid",
  paid_at: "2026-07-02T08:05:00.000Z",
  created_by: "employee-1",
  remark: null,
  metadata: { product_snapshot: { code: "credit_1000" } },
  payment_config_id: "platform-config-1",
  out_trade_no: "TC202607020001",
  prepay_id: "prepay-credit-1",
  transaction_id: "4200000000202607020000000001",
  paid_amount_fen: 10000,
  closed_at: null,
  latest_notification_id: "credit-notification-1",
  refund_status: "refunding",
  refund_requested_at: "2026-07-02T09:00:00.000Z",
  refunded_at: null,
  refund_amount_fen: null,
  created_at: "2026-07-02T08:01:00.000Z",
  updated_at: "2026-07-02T08:05:00.000Z",
} satisfies TenantCreditOrderRecord;

const refundRequest = {
  id: "refund-request-1",
  tenant_id: "tenant-1",
  order_id: "credit-order-1",
  request_no: "TR202607020001",
  idempotency_key: "refund-idem-1",
  status: "refunding",
  reason: "客户误充值",
  requested_amount_fen: 10000,
  requested_credits: 1100,
  requested_by_employee_id: "employee-1",
  reviewed_by_employee_id: "platform-admin-1",
  reviewed_at: "2026-07-02T09:10:00.000Z",
  review_note: "同意退款",
  out_refund_no: "TR202607020001",
  wechat_refund_id: null,
  refund_amount_fen: null,
  refunded_at: null,
  failure_message: null,
  metadata: {},
  created_at: "2026-07-02T09:00:00.000Z",
  updated_at: "2026-07-02T09:10:00.000Z",
} satisfies TenantCreditRefundRequestRecord;

const refundNotification = {
  id: "refund-notification-1",
  tenant_id: "tenant-1",
  credit_order_id: "credit-order-1",
  notify_id: "notify-refund-1",
  event_type: "REFUND.SUCCESS",
  resource_type: "encrypt-resource",
  raw_payload: {},
  signature_valid: true,
  processed: false,
  processed_at: null,
  error_message: null,
  created_at: "2026-07-02T09:20:01.000Z",
  updated_at: "2026-07-02T09:20:01.000Z",
} satisfies TenantCreditWechatNotificationRecord;

const refundRawBody = JSON.stringify({
  id: "notify-refund-1",
  event_type: "REFUND.SUCCESS",
  resource_type: "encrypt-resource",
  summary: "退款成功",
  resource: {
    nonce: "resource-nonce",
    associated_data: "refund",
    ciphertext: "ciphertext",
  },
});

const decryptedRefundResource = {
  out_trade_no: "TC202607020001",
  out_refund_no: "TR202607020001",
  refund_id: "5030000000202607020000000001",
  refund_status: "SUCCESS",
  success_time: "2026-07-02T09:20:00+08:00",
  amount: {
    total: 10000,
    refund: 10000,
    payer_total: 10000,
    payer_refund: 10000,
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
const decryptResource = mock((): Record<string, unknown> => decryptedRefundResource);
const findCreditOrderByOutTradeNo = mock(
  async (): Promise<TenantCreditOrderRecord | null> => null,
);
const findRefundRequestByOutRefundNo = mock(async () => ({
  request: refundRequest,
  order: creditOrder,
}));
const findCreditNotificationByNotifyId = mock(
  async (): Promise<TenantCreditWechatNotificationRecord | null> => null,
);
const createCreditNotification = mock(
  async (): Promise<TenantCreditWechatNotificationRecord> => refundNotification,
);
const markCreditNotificationProcessed = mock(async () => ({
  ...refundNotification,
  processed: true,
}));
const markCreditNotificationFailed = mock(async () => ({
  ...refundNotification,
  processed: false,
}));
const confirmWechatRecharge = mock(async () => ({
  order: {},
  account: {},
  ledger: {},
  recovery: { recovered: true },
  idempotent: false,
}));
const confirmWechatRechargeRefund = mock(async () => ({
  request: {},
  order: {},
  account: { id: "account-1", available_credits: 2000 },
  ledger: { id: "refund-ledger-1" },
  idempotent: false,
}));
const markWechatRechargeRefundFailed = mock(async () => ({
  request: refundRequest,
  order: creditOrder,
}));
const createPayment = mock(async (): Promise<PaymentRecord> => {
  throw new Error("project payment should not be created for credit refund");
});
const completePaymentTask = mock(async () => {
  throw new Error("workflow task should not complete for credit refund");
});

async function createService() {
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
      markWechatRechargeRefundFailed,
    },
    paymentRepository: { create: createPayment },
    paymentBridge: { complete: completePaymentTask },
  });
}

describe("WechatPayCallbackService credit recharge refund callbacks", () => {
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
      markWechatRechargeRefundFailed,
      createPayment,
      completePaymentTask,
    ]) {
      fn.mockClear();
    }
    verifySignature.mockImplementation(() => true);
    decryptResource.mockImplementation(() => decryptedRefundResource);
    findRefundRequestByOutRefundNo.mockImplementation(async () => ({
      request: refundRequest,
      order: creditOrder,
    }));
    findCreditNotificationByNotifyId.mockImplementation(async () => null);
  });

  test("processes successful refund callback into reverse credit ledger", async () => {
    const service = await createService();

    const result = await service.handleCallback({
      rawBody: refundRawBody,
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
        "wechatpay-serial": "PUB_KEY_ID_TEST",
      },
    });

    expect(result).toEqual({ code: "SUCCESS", message: "成功" });
    expect(findCreditOrderByOutTradeNo).not.toHaveBeenCalled();
    expect(findRefundRequestByOutRefundNo).toHaveBeenCalledWith(
      "TR202607020001",
    );
    expect(createCreditNotification).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      credit_order_id: "credit-order-1",
      notify_id: "notify-refund-1",
      event_type: "REFUND.SUCCESS",
    }));
    expect(confirmWechatRechargeRefund).toHaveBeenCalledWith({
      refundRequestId: "refund-request-1",
      outRefundNo: "TR202607020001",
      wechatRefundId: "5030000000202607020000000001",
      refundAmountFen: 10000,
      refundedAt: "2026-07-02T09:20:00+08:00",
      notificationId: "refund-notification-1",
      metadata: {
        callback_notify_id: "notify-refund-1",
        out_refund_no: "TR202607020001",
        refund_id: "5030000000202607020000000001",
      },
    });
    expect(markCreditNotificationProcessed).toHaveBeenCalledWith({
      notificationId: "refund-notification-1",
    });
    expect(confirmWechatRecharge).not.toHaveBeenCalled();
    expect(createPayment).not.toHaveBeenCalled();
    expect(completePaymentTask).not.toHaveBeenCalled();
  });

  test("returns success without refund side effects for duplicate notification", async () => {
    findCreditNotificationByNotifyId.mockImplementationOnce(async () => ({
      ...refundNotification,
      processed: true,
    }));
    const service = await createService();

    const result = await service.handleCallback({
      rawBody: refundRawBody,
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
      },
    });

    expect(result).toEqual({ code: "SUCCESS", message: "成功" });
    expect(createCreditNotification).not.toHaveBeenCalled();
    expect(confirmWechatRechargeRefund).not.toHaveBeenCalled();
    expect(markWechatRechargeRefundFailed).not.toHaveBeenCalled();
    expect(markCreditNotificationProcessed).not.toHaveBeenCalled();
  });

  test("marks refund request failed for failed refund callback", async () => {
    decryptResource.mockImplementationOnce(() => ({
      ...decryptedRefundResource,
      refund_status: "CLOSED",
    }));
    createCreditNotification.mockImplementationOnce(async () => ({
      ...refundNotification,
      event_type: "REFUND.CLOSED",
    }));
    const service = await createService();

    const result = await service.handleCallback({
      rawBody: JSON.stringify({
        ...JSON.parse(refundRawBody),
        event_type: "REFUND.CLOSED",
      }),
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
      },
    });

    expect(result).toEqual({ code: "SUCCESS", message: "成功" });
    expect(confirmWechatRechargeRefund).not.toHaveBeenCalled();
    expect(markWechatRechargeRefundFailed).toHaveBeenCalledWith({
      refundRequestId: "refund-request-1",
      tenantId: "tenant-1",
      orderId: "credit-order-1",
      failureMessage: "REFUND.CLOSED",
      metadata: {
        callback_notify_id: "notify-refund-1",
        out_refund_no: "TR202607020001",
        refund_id: "5030000000202607020000000001",
        refund_status: "CLOSED",
      },
    });
    expect(markCreditNotificationProcessed).toHaveBeenCalledWith({
      notificationId: "refund-notification-1",
    });
  });
});
