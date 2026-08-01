import { createHash } from "node:crypto";
import { describe, expect, mock, test } from "bun:test";

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

async function service() {
  const processProviderNotification = mock(async () => ({
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
  const { WechatVirtualPaymentNotificationService } = await import(
    "./wechat-virtual-payment-notifications"
  );
  return {
    instance: new WechatVirtualPaymentNotificationService({
      settings: { getPlatformSecretString: async (key) =>
        key === "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN" ? token : "gh_original" },
      refunds: { processProviderNotification, processIosInquiry, compensate },
    }),
    processProviderNotification, processIosInquiry, compensate,
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
});
