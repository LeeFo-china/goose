import { createHash } from "node:crypto";
import { describe, expect, mock, test } from "bun:test";

import type { BrandingVirtualOrderRecord } from "@/repositories/branding-virtual-orders";
import type { BrandingVirtualRefundOrderContext } from "@/repositories/branding-virtual-refunds";
import type { QueryVirtualOrderResult } from "./wechat-virtual-payment-gateway-contracts";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const token = "message-token";
const query = {
  timestamp: "1714037059", nonce: "486452656",
  signature: createHash("sha1")
    .update([token, "1714037059", "486452656"].sort().join(""))
    .digest("hex"),
};

const order = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  order_no: "BVO-1",
  out_trade_no: "BV202608010001",
  idempotency_key: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  product_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  product_name: "年度品牌权益",
  term_years: 1,
  purchase_notes: "支付后开通",
  refund_policy: "按规则退款",
  offer_id: "offer-1",
  requested_platform: "ios",
  settlement_channel: null,
  payer_openid: "payer-openid",
  provider_order_no: "wx-order-1",
  transaction_id: "transaction-1",
  payment_status: "succeeded",
  fulfillment_status: "granted",
  refund_status: "none",
  paid_amount_fen: 100,
  paid_at: "2026-08-01T01:00:00.000Z",
  entitlement_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  config_version: 1,
  secret_revision: 1,
  payment_expires_at: "2026-08-01T01:05:00.000Z",
  failure_code: null,
  failure_message: null,
  payment_request_claim_token: null,
  payment_request_claimed_at: null,
  payment_request_claim_expires_at: null,
  payment_request_issued_at: "2026-08-01T01:00:00.000Z",
  payment_request_attempt_revision: 1,
  created_by: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  created_at: "2026-08-01T01:00:00.000Z",
  updated_at: "2026-08-01T01:00:00.000Z",
  provider_product_id: "branding-annual",
  amount_fen: 100,
  environment: "production",
} satisfies BrandingVirtualOrderRecord;

const refundContext = (providerOrderType: 0 | 7 | null) => ({
  id: order.id,
  tenant_id: order.tenant_id,
  out_trade_no: order.out_trade_no,
  environment: order.environment,
  provider_order_type: providerOrderType,
  payer_openid: order.payer_openid,
  provider_order_no: order.provider_order_no,
  payment_status: order.payment_status,
  fulfillment_status: order.fulfillment_status,
  refund_status: order.refund_status,
  amount_fen: order.amount_fen,
  paid_amount_fen: order.paid_amount_fen,
  paid_at: order.paid_at,
  entitlement_event_id: order.entitlement_event_id,
  secret_revision: order.secret_revision,
  created_by_user_id: "11111111-1111-4111-8111-111111111111",
}) satisfies BrandingVirtualRefundOrderContext;

const appleRefundQuery: QueryVirtualOrderResult = {
  requestId: "query-request-1",
  environment: "production",
  orderId: order.out_trade_no,
  status: 8,
  businessType: 0,
  orderType: 8,
  orderFee: 100,
  couponFee: null,
  paidFee: 100,
  refundFee: 100,
  leftFee: 0,
  createdAt: 1,
  updatedAt: 2,
  paidAt: 1,
  providedAt: 1,
  wechatOrderId: "wx-order-1",
  channelOrderId: null,
  wechatPayOrderId: null,
  settledAt: null,
  settlementState: null,
  platformFeeFen: null,
  cpsFeeFen: null,
};

async function service(input: {
  providerOrderType?: 0 | 7 | null;
  queryResult?: QueryVirtualOrderResult;
} = {}) {
  let context = refundContext(
    input.providerOrderType === undefined ? 7 : input.providerOrderType,
  );
  const processProviderNotification = mock(async (): Promise<{
    notification_id: string;
    refund_id: string;
    refund_status: "succeeded" | "failed";
    compensation_status: "pending";
  }> => ({
    notification_id: "11111111-1111-4111-8111-111111111111",
    refund_id: "22222222-2222-4222-8222-222222222222",
    refund_status: "succeeded" as const,
    compensation_status: "pending" as const,
  }));
  const processIosInquiry = mock(async () => ({
    notification_id: "33333333-3333-4333-8333-333333333333",
    result_code: 1 as const, result_info: "建议暂缓退款",
    evidence: "数字权益已完成交付",
  }));
  const compensate = mock(async () => ({
    refund_id: "22222222-2222-4222-8222-222222222222",
    compensation_status: "succeeded" as const,
    compensation_entitlement_event_id: "44444444-4444-4444-8444-444444444444",
  }));
  const findByOutTradeNo = mock(async () => order);
  const findOrderContext = mock(async () => context);
  const recordAppleRefundOrderTypeFact = mock(async () => {
    context = { ...context, provider_order_type: 7 };
    return true;
  });
  const queryOrder = mock(async () => input.queryResult ?? appleRefundQuery);
  const getAccessToken = mock(async () => "access-token");
  const { WechatVirtualPaymentRefundChannelVerifier } = await import(
    "./wechat-virtual-payment-refund-channel"
  );
  const refundChannelVerifier = new WechatVirtualPaymentRefundChannelVerifier({
    settings: { getPlatformSecretString: async () =>
      JSON.stringify({ appKey: "a".repeat(32), revision: 1 }) },
    orders: { findByOutTradeNo },
    refunds: { findOrderContext, recordAppleRefundOrderTypeFact },
    gateway: { queryOrder },
    accessTokenProvider: { getAccessToken },
  });
  const { WechatVirtualPaymentNotificationService } = await import(
    "./wechat-virtual-payment-notifications"
  );
  return {
    instance: new WechatVirtualPaymentNotificationService({
      settings: { getPlatformSecretString: async (key) =>
        key === "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN" ? token
          : key === "WECHAT_MINIPROGRAM_ORIGINAL_ID" ? "gh_original"
          : JSON.stringify({ appKey: "a".repeat(32), revision: 1 }) },
      orders: { findByOutTradeNo },
      refunds: { processProviderNotification, processIosInquiry, compensate },
      refundChannelVerifier,
    }),
    processProviderNotification, processIosInquiry, compensate,
    findByOutTradeNo, findOrderContext, recordAppleRefundOrderTypeFact,
    queryOrder, getAccessToken,
  };
}

describe("virtual refund notifications", () => {
  test("persists an iOS inquiry without recording refund success", async () => {
    const ports = await service();
    const result = await ports.instance.handle({
      rawBody: JSON.stringify({
        ToUserName: "gh_original", FromUserName: "official-account",
        CreateTime: 1_714_037_059, MsgType: "event",
        Event: "xpay_subscribe_ios_refund_query_notify",
        refund_time: 1_714_037_061, order_time: 1_714_037_060,
        channel_bill: "apple-bill-1", bundleid: "com.goodcms.mini",
        product_id: "branding-annual", p_count: 1,
        refund_request_reason: "用户申请退款", provide_status: 1,
        pay_order_id: "BV202608010001",
      }), contentType: "application/json", query, requestId: "inquiry",
    });
    expect(result).toMatchObject({ kind: "ios_refund_inquiry", body: { result_code: 1 } });
    expect(ports.processIosInquiry).toHaveBeenCalledTimes(1);
    expect(ports.processProviderNotification).not.toHaveBeenCalled();
    expect(ports.compensate).not.toHaveBeenCalled();
  });

  test("only successful final notification triggers compensation", async () => {
    const ports = await service();
    const result = await ports.instance.handle({
      rawBody: JSON.stringify({
        ToUserName: "gh_original", FromUserName: "official-account",
        CreateTime: 1_714_037_059, MsgType: "event", Event: "xpay_refund_notify",
        OpenId: "payer-openid", WxRefundId: "wx-refund-1", MchRefundId: "BVR-1",
        WxOrderId: "wx-order-1", MchOrderId: "BV202608010001", RefundFee: 100,
        RetCode: 0, RetMsg: "SUCCESS", RefundStartTimestamp: 1_714_037_060,
        RefundSuccTimestamp: 1_714_037_061,
        WxpayRefundTransactionId: "wx-refund-transaction-1", RetryTimes: 0,
      }), contentType: "application/json", query, requestId: "refund",
    });
    expect(result.body).toEqual({ ErrCode: 0, ErrMsg: "success" });
    expect(ports.processProviderNotification).toHaveBeenCalledWith(
      expect.objectContaining({ successful: true, refundFeeFen: 100 }),
    );
    expect(ports.compensate).toHaveBeenCalledTimes(1);
  });

  test("records a trusted Apple channel before a notification-first refund", async () => {
    const ports = await service({ providerOrderType: null });
    const rawBody = JSON.stringify({
      ToUserName: "gh_original", FromUserName: "official-account",
      CreateTime: 1_714_037_059, MsgType: "event", Event: "xpay_refund_notify",
      OpenId: "payer-openid", WxRefundId: "wx-refund-1", MchRefundId: "BVR-1",
      WxOrderId: "wx-order-1", MchOrderId: "BV202608010001", RefundFee: 100,
      RetCode: 0, RetMsg: "SUCCESS", RefundStartTimestamp: 1_714_037_060,
      RefundSuccTimestamp: 1_714_037_061,
      WxpayRefundTransactionId: "wx-refund-transaction-1", RetryTimes: 0,
    });

    const first = await ports.instance.handle({ rawBody,
      contentType: "application/json", query, requestId: "notification-first" });
    const duplicate = await ports.instance.handle({ rawBody,
      contentType: "application/json", query, requestId: "notification-duplicate" });

    expect(first.body).toEqual({ ErrCode: 0, ErrMsg: "success" });
    expect(duplicate.body).toEqual({ ErrCode: 0, ErrMsg: "success" });
    expect(ports.queryOrder).toHaveBeenCalledTimes(1);
    expect(ports.recordAppleRefundOrderTypeFact).toHaveBeenCalledTimes(1);
    expect(ports.recordAppleRefundOrderTypeFact).toHaveBeenCalledWith({
      orderId: order.id,
      officialStatus: 8,
      providerOrderType: 8,
      outTradeNo: order.out_trade_no,
      environment: order.environment,
      providerOrderNo: order.provider_order_no,
      orderFeeFen: 100,
      paidFeeFen: 100,
      refundFeeFen: 100,
      leftFeeFen: 0,
    });
    expect(ports.processProviderNotification).toHaveBeenCalledTimes(2);
    expect(ports.compensate).toHaveBeenCalledTimes(2);
  });

  test.each([
    ["merchant refund type", { ...appleRefundQuery, orderType: 1 as const }],
    ["payment state", { ...appleRefundQuery, status: 2 as const, orderType: 7 as const }],
    ["wrong order", { ...appleRefundQuery, orderId: "BV202608010099" }],
    ["wrong provider order", { ...appleRefundQuery, wechatOrderId: "wx-order-other" }],
    ["partial amount", { ...appleRefundQuery, refundFee: 99, leftFee: 1 }],
  ])("rejects an untrusted notification-first %s fact", async (_label, queryResult) => {
    const ports = await service({ providerOrderType: null, queryResult });
    const result = await ports.instance.handle({
      rawBody: JSON.stringify({
        ToUserName: "gh_original", FromUserName: "official-account",
        CreateTime: 1_714_037_059, MsgType: "event", Event: "xpay_refund_notify",
        OpenId: "payer-openid", WxRefundId: "wx-refund-1", MchRefundId: "BVR-1",
        WxOrderId: "wx-order-1", MchOrderId: "BV202608010001", RefundFee: 100,
        RetCode: 0, RetMsg: "SUCCESS", RefundStartTimestamp: 1_714_037_060,
        RefundSuccTimestamp: 1_714_037_061,
        WxpayRefundTransactionId: "wx-refund-transaction-1", RetryTimes: 0,
      }),
      contentType: "application/json", query, requestId: "refund-conflict",
    });
    expect(result).toMatchObject({ body: { ErrCode: 1, ErrMsg: "retry" },
      errorCode: "BRANDING_VIRTUAL_REFUND_NOTIFICATION_QUERY_CONFLICT" });
    expect(ports.recordAppleRefundOrderTypeFact).not.toHaveBeenCalled();
    expect(ports.processProviderNotification).not.toHaveBeenCalled();
    expect(ports.compensate).not.toHaveBeenCalled();
  });

  test("does not query again when a trusted channel fact already exists", async () => {
    const ports = await service({ providerOrderType: 7 });
    const result = await ports.instance.handle({
      rawBody: JSON.stringify({
        ToUserName: "gh_original", FromUserName: "official-account",
        CreateTime: 1_714_037_059, MsgType: "event", Event: "xpay_refund_notify",
        OpenId: "payer-openid", WxRefundId: "wx-refund-1", MchRefundId: "BVR-1",
        WxOrderId: "wx-order-1", MchOrderId: "BV202608010001", RefundFee: 100,
        RetCode: 0, RetMsg: "SUCCESS", RefundStartTimestamp: 1_714_037_060,
        RefundSuccTimestamp: 1_714_037_061,
        WxpayRefundTransactionId: "wx-refund-transaction-1", RetryTimes: 0,
      }),
      contentType: "application/json", query, requestId: "refund-known-channel",
    });
    expect(result.body).toEqual({ ErrCode: 0, ErrMsg: "success" });
    expect(ports.queryOrder).not.toHaveBeenCalled();
    expect(ports.recordAppleRefundOrderTypeFact).not.toHaveBeenCalled();
  });

  test("returns retry when compensation fails and recovers idempotently", async () => {
    const ports = await service();
    ports.compensate.mockRejectedValueOnce({ code: "DB_ERROR" });
    const rawBody = JSON.stringify({
      ToUserName: "gh_original", FromUserName: "official-account",
      CreateTime: 1_714_037_059, MsgType: "event", Event: "xpay_refund_notify",
      OpenId: "payer-openid", WxRefundId: "wx-refund-1", MchRefundId: "BVR-1",
      WxOrderId: "wx-order-1", MchOrderId: "BV202608010001", RefundFee: 100,
      RetCode: 0, RetMsg: "SUCCESS", RefundStartTimestamp: 1_714_037_060,
      RefundSuccTimestamp: 1_714_037_061,
      WxpayRefundTransactionId: "wx-refund-transaction-1", RetryTimes: 0,
    });
    const first = await ports.instance.handle({ rawBody,
      contentType: "application/json", query, requestId: "refund-fail" });
    expect(first).toMatchObject({ kind: "ack",
      body: { ErrCode: 1, ErrMsg: "retry" }, errorCode: "DB_ERROR" });
    expect(ports.processProviderNotification).toHaveBeenCalledTimes(1);
    expect(ports.compensate).toHaveBeenCalledTimes(1);

    const retried = await ports.instance.handle({ rawBody,
      contentType: "application/json", query, requestId: "refund-retry" });
    expect(retried.body).toEqual({ ErrCode: 0, ErrMsg: "success" });
    expect(ports.processProviderNotification).toHaveBeenCalledTimes(2);
    expect(ports.compensate).toHaveBeenCalledTimes(2);
  });

  test("records a failed refund notification without compensation", async () => {
    const ports = await service({
      providerOrderType: null,
      queryResult: {
        ...appleRefundQuery,
        status: 7,
        orderType: 8,
        refundFee: 0,
        leftFee: 100,
      },
    });
    ports.processProviderNotification.mockResolvedValueOnce({
      notification_id: "11111111-1111-4111-8111-111111111111",
      refund_id: "22222222-2222-4222-8222-222222222222",
      refund_status: "failed",
      compensation_status: "pending",
    });
    const result = await ports.instance.handle({
      rawBody: JSON.stringify({
        ToUserName: "gh_original", FromUserName: "official-account",
        CreateTime: 1_714_037_059, MsgType: "event", Event: "xpay_refund_notify",
        OpenId: "payer-openid", WxRefundId: "wx-refund-1", MchRefundId: "BVR-1",
        WxOrderId: "wx-order-1", MchOrderId: "BV202608010001", RefundFee: 100,
        RetCode: 1, RetMsg: "FAILED", RefundStartTimestamp: 1_714_037_060,
        RefundSuccTimestamp: 0,
        WxpayRefundTransactionId: "wx-refund-transaction-1", RetryTimes: 0,
      }),
      contentType: "application/json", query, requestId: "refund-failed",
    });
    expect(result.body).toEqual({ ErrCode: 0, ErrMsg: "success" });
    expect(ports.processProviderNotification).toHaveBeenCalledWith(
      expect.objectContaining({ successful: false, refundSucceededAt: null }),
    );
    expect(ports.recordAppleRefundOrderTypeFact).toHaveBeenCalledWith(
      expect.objectContaining({ officialStatus: 7, providerOrderType: 8,
        refundFeeFen: 0, leftFeeFen: 100 }),
    );
    expect(ports.compensate).not.toHaveBeenCalled();
  });
});
