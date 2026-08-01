import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const NOTIFICATION_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const record = {
  id: NOTIFICATION_ID,
  event_key: "a".repeat(64),
  payload_sha256: "b".repeat(64),
  status: "processing" as const,
  order_id: null,
  retry_count: 0,
  result_summary: {},
};

const createInput = {
  eventType: "xpay_goods_deliver_notify" as const,
  environment: "production" as const,
  recipientOriginalId: "gh_original",
  senderIdHash: "c".repeat(64),
  providerCreatedAtUnix: 1_714_037_059,
  messageType: "event" as const,
  outTradeNo: "BV202608010001",
  providerProductId: "branding-annual",
  openidHash: "d".repeat(64),
  providerOrderNo: "provider-order-1",
  transactionId: "transaction-1",
  paidAt: "2026-08-01T01:01:00.000Z",
  quantity: 1 as const,
  origPriceFen: 100,
  actualPriceFen: 100,
  attach: ORDER_ID,
  requestId: "request-1",
};

function repositoryWith(result: { data: unknown; error: unknown }) {
  const rpc = mock(async (
    _name: string,
    _parameters: Record<string, unknown>,
  ) => result);
  const client = { rpc };
  return { client, rpc };
}

describe("WechatVirtualPaymentNotificationRepository", () => {
  test("accepts only typed facts through the dedicated canonicalization RPC", async () => {
    const fixture = repositoryWith({ data: { created: true, record }, error: null });
    const { WechatVirtualPaymentNotificationRepository } = await import(
      "./wechat-virtual-payment-notifications"
    );
    const repository = new WechatVirtualPaymentNotificationRepository(
      () => fixture.client,
    );

    expect(await repository.createOrGet(createInput)).toEqual({
      created: true,
      record,
    });
    expect(fixture.rpc).toHaveBeenCalledWith(
      "wechat_accept_virtual_payment_notification",
      {
        p_event_type: createInput.eventType,
        p_environment: createInput.environment,
        p_recipient_original_id: createInput.recipientOriginalId,
        p_sender_id_hash: createInput.senderIdHash,
        p_provider_created_at: createInput.providerCreatedAtUnix,
        p_msg_type: createInput.messageType,
        p_out_trade_no: createInput.outTradeNo,
        p_provider_product_id: createInput.providerProductId,
        p_openid_hash: createInput.openidHash,
        p_provider_order_no: createInput.providerOrderNo,
        p_transaction_id: createInput.transactionId,
        p_paid_at: createInput.paidAt,
        p_quantity: createInput.quantity,
        p_orig_price_fen: createInput.origPriceFen,
        p_actual_price_fen: createInput.actualPriceFen,
        p_attach: createInput.attach,
        p_request_id: createInput.requestId,
      },
    );
    const params = fixture.rpc.mock.calls[0]?.[1];
    expect(params).not.toHaveProperty("normalized_payload");
    expect(params).not.toHaveProperty("authentication_status");
    expect(params).not.toHaveProperty("payload_sha256");
  });

  test("marks completion through a typed result command", async () => {
    const processed = { ...record, status: "processed", order_id: ORDER_ID };
    const fixture = repositoryWith({ data: processed, error: null });
    const { WechatVirtualPaymentNotificationRepository } = await import(
      "./wechat-virtual-payment-notifications"
    );
    const repository = new WechatVirtualPaymentNotificationRepository(
      () => fixture.client,
    );

    await repository.markProcessed({
      notificationId: NOTIFICATION_ID,
      orderId: ORDER_ID,
      paymentRecorded: true,
      fulfilled: true,
      entitlementEventId: "33333333-3333-4333-8333-333333333333",
      entitlementStatus: "active",
    });
    expect(fixture.rpc).toHaveBeenCalledWith(
      "wechat_mark_virtual_payment_notification_processed",
      expect.objectContaining({
        p_notification_id: NOTIFICATION_ID,
        p_order_id: ORDER_ID,
        p_payment_recorded: true,
        p_fulfilled: true,
      }),
    );
  });

  test("delegates retry increments to one atomic failed command", async () => {
    const fixture = repositoryWith({
      data: { ...record, status: "failed", retry_count: 1 },
      error: null,
    });
    const { WechatVirtualPaymentNotificationRepository } = await import(
      "./wechat-virtual-payment-notifications"
    );
    const repository = new WechatVirtualPaymentNotificationRepository(
      () => fixture.client,
    );

    await repository.markFailed({
      notificationId: NOTIFICATION_ID,
      orderId: ORDER_ID,
      errorCode: "DB_ERROR",
      errorSummary: "微信虚拟支付消息等待重试",
    });
    expect(fixture.rpc).toHaveBeenCalledWith(
      "wechat_mark_virtual_payment_notification_failed",
      {
        p_notification_id: NOTIFICATION_ID,
        p_order_id: ORDER_ID,
        p_error_code: "DB_ERROR",
        p_error_summary: "微信虚拟支付消息等待重试",
      },
    );
  });

  test.each([
    ["WECHAT_VIRTUAL_NOTIFICATION_INPUT_INVALID", 400],
    ["WECHAT_VIRTUAL_NOTIFICATION_EVENT_CONFLICT", 409],
    ["WECHAT_VIRTUAL_NOTIFICATION_NOT_FOUND", 404],
    ["WECHAT_VIRTUAL_NOTIFICATION_ORDER_CONFLICT", 409],
  ])("maps %s without leaking database details", async (code, statusCode) => {
    const fixture = repositoryWith({
      data: null,
      error: { code: "P0001", message: code },
    });
    const { WechatVirtualPaymentNotificationRepository } = await import(
      "./wechat-virtual-payment-notifications"
    );
    const repository = new WechatVirtualPaymentNotificationRepository(
      () => fixture.client,
    );

    await expect(repository.createOrGet(createInput)).rejects.toMatchObject({
      code,
      statusCode,
    });
  });
});
