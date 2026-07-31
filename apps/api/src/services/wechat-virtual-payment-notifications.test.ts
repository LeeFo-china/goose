import { createHash } from "node:crypto";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { BrandingVirtualOrderRecord } from "@/repositories/branding-virtual-orders";
import type { BrandingVirtualPurchaseConfirmationResult } from "@/repositories/branding-virtual-orders";
import type { WechatVirtualPaymentNotificationRepository } from "@/repositories/wechat-virtual-payment-notifications";
import type { BrandingVirtualPaymentConfirmationInput } from "./branding-virtual-payment-confirmation";

type CreateOrGetInput = Parameters<
  WechatVirtualPaymentNotificationRepository["createOrGet"]
>[0];
type CreateOrGetResult = Awaited<ReturnType<
  WechatVirtualPaymentNotificationRepository["createOrGet"]
>>;

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const rawBody = JSON.stringify({
  ToUserName: "gh_original",
  FromUserName: "official-openid",
  CreateTime: 1_714_037_059,
  MsgType: "event",
  Event: "xpay_goods_deliver_notify",
  OpenId: "payer-openid",
  OutTradeNo: "BV202608010001",
  Env: 0,
  WeChatPayInfo: {
    MchOrderNo: "provider-order-1",
    TransactionId: "transaction-1",
    PaidTime: 1_714_037_060,
  },
  GoodsInfo: {
    ProductId: "branding-annual",
    Quantity: 1,
    OrigPrice: 100,
    ActualPrice: 100,
    Attach: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  },
});
const token = "message-token";
const originalId = "gh_original";
const query = {
  timestamp: "1714037059",
  nonce: "486452656",
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
  requested_platform: "android",
  settlement_channel: null,
  payer_openid: "payer-openid",
  provider_order_no: null,
  transaction_id: null,
  payment_status: "pending",
  fulfillment_status: "pending",
  refund_status: "none",
  paid_amount_fen: null,
  paid_at: null,
  entitlement_event_id: null,
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
  created_by: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  created_at: "2026-08-01T01:00:00.000Z",
  updated_at: "2026-08-01T01:00:00.000Z",
  provider_product_id: "branding-annual",
  amount_fen: 100,
  environment: "production",
} satisfies BrandingVirtualOrderRecord;

describe("WechatVirtualPaymentNotificationService", () => {
  const getPlatformSecretString = mock(async (key: string): Promise<string> => (
    key === "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN" ? token : originalId
  ));
  const findByOutTradeNo = mock(async () => order);
  const createOrGet = mock(async (input: CreateOrGetInput): Promise<CreateOrGetResult> => ({
    created: true,
    record: {
      id: "99999999-9999-4999-8999-999999999999",
      event_key: input.eventKey,
      payload_sha256: input.payloadSha256,
      status: "processing" as const,
      order_id: null,
      retry_count: 0,
      result_summary: {},
    },
  }));
  const markProcessed = mock(async (
    _input: Parameters<WechatVirtualPaymentNotificationRepository["markProcessed"]>[0],
  ) => undefined);
  const markFailed = mock(async (
    _input: Parameters<WechatVirtualPaymentNotificationRepository["markFailed"]>[0],
  ) => undefined);
  const confirm = mock(async (
    _input: BrandingVirtualPaymentConfirmationInput,
  ): Promise<BrandingVirtualPurchaseConfirmationResult> => ({
    idempotent: false,
    payment_recorded: true,
    fulfilled: true,
    recoverable: false,
    entitlement_event_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    entitlement_status: "active",
    failure_code: null,
  }));

  const createService = async () => {
    const { WechatVirtualPaymentNotificationService } = await import(
      "./wechat-virtual-payment-notifications"
    );
    return new WechatVirtualPaymentNotificationService({
      settings: { getPlatformSecretString },
      notifications: { createOrGet, markProcessed, markFailed },
      orders: { findByOutTradeNo },
      confirmation: { confirm },
    });
  };

  beforeEach(() => {
    getPlatformSecretString.mockClear();
    findByOutTradeNo.mockClear();
    createOrGet.mockClear();
    markProcessed.mockClear();
    markFailed.mockClear();
    confirm.mockClear();
  });

  test("authenticates before persistence and returns the matching JSON success ack", async () => {
    const result = await (await createService()).handle({
      rawBody,
      contentType: "application/json",
      query,
      requestId: "request-1",
    });

    expect(result).toMatchObject({
      httpStatus: 200,
      format: "json",
      body: { ErrCode: 0, ErrMsg: "success" },
    });
    expect(createOrGet).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(markProcessed).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(createOrGet.mock.calls[0])).not.toContain("payer-openid");
  });

  test("rejects a forged signature before order lookup, persistence, or fulfillment", async () => {
    await expect((await createService()).handle({
      rawBody,
      contentType: "application/json",
      query: { ...query, signature: "0".repeat(40) },
      requestId: "request-2",
    })).rejects.toMatchObject({
      statusCode: 401,
      code: "WECHAT_VIRTUAL_MESSAGE_SIGNATURE_INVALID",
    });
    expect(createOrGet).not.toHaveBeenCalled();
    expect(findByOutTradeNo).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  test("fails closed when the dedicated message token is absent", async () => {
    getPlatformSecretString.mockResolvedValueOnce("");
    await expect((await createService()).verifyEndpoint({
      ...query,
      echostr: "echo-value",
    })).rejects.toMatchObject({
      statusCode: 503,
      code: "WECHAT_VIRTUAL_MESSAGE_TOKEN_MISSING",
    });
  });

  test("fails closed when the Mini Program original ID is absent", async () => {
    getPlatformSecretString.mockImplementationOnce(async () => token)
      .mockImplementationOnce(async () => "");
    const result = await (await createService()).handle({
      rawBody,
      contentType: "application/json",
      query,
      requestId: "request-original-id-missing",
    });

    expect(result).toMatchObject({
      body: { ErrCode: 1, ErrMsg: "retry" },
      errorCode: "WECHAT_VIRTUAL_MESSAGE_ORIGINAL_ID_MISSING",
    });
    expect(createOrGet).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  test("rejects a ToUserName mismatch before inbox persistence", async () => {
    getPlatformSecretString.mockImplementationOnce(async () => token)
      .mockImplementationOnce(async () => "gh_other");
    const result = await (await createService()).handle({
      rawBody,
      contentType: "application/json",
      query,
      requestId: "request-original-id-mismatch",
    });

    expect(result).toMatchObject({
      errorCode: "WECHAT_VIRTUAL_MESSAGE_ORIGINAL_ID_MISMATCH",
    });
    expect(createOrGet).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  test("returns the original successful fact for a processed duplicate", async () => {
    createOrGet.mockImplementationOnce(async (input) => ({
      created: false,
      record: {
        id: "99999999-9999-4999-8999-999999999999",
        event_key: input.eventKey,
        payload_sha256: input.payloadSha256,
        status: "processed" as const,
        order_id: order.id,
        retry_count: 0,
        result_summary: {
          fulfilled: true,
          entitlement_event_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        },
      },
    }));

    const result = await (await createService()).handle({
      rawBody,
      contentType: "application/json",
      query,
      requestId: "request-3",
    });

    expect(result.body).toEqual({ ErrCode: 0, ErrMsg: "success" });
    expect(confirm).not.toHaveBeenCalled();
  });

  test("re-runs idempotent confirmation for an orphaned processing duplicate", async () => {
    createOrGet.mockImplementationOnce(async (input) => ({
      created: false,
      record: {
        id: "99999999-9999-4999-8999-999999999999",
        event_key: input.eventKey,
        payload_sha256: input.payloadSha256,
        status: "processing" as const,
        order_id: null,
        retry_count: 0,
        result_summary: {},
      },
    }));

    const result = await (await createService()).handle({
      rawBody,
      contentType: "application/json",
      query,
      requestId: "request-processing-retry",
    });

    expect(result.body).toEqual({ ErrCode: 0, ErrMsg: "success" });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(markProcessed).toHaveBeenCalledTimes(1);
  });

  test("recovers when fulfillment committed but inbox completion initially failed", async () => {
    const service = await createService();
    markProcessed.mockRejectedValueOnce(Errors.dbError("临时写入故障"));

    const first = await service.handle({
      rawBody,
      contentType: "application/json",
      query,
      requestId: "request-completion-crash-1",
    });
    expect(first).toMatchObject({
      body: { ErrCode: 1, ErrMsg: "retry" },
      errorCode: "DB_ERROR",
    });

    createOrGet.mockImplementationOnce(async (input) => ({
      created: false,
      record: {
        id: "99999999-9999-4999-8999-999999999999",
        event_key: input.eventKey,
        payload_sha256: input.payloadSha256,
        status: "failed" as const,
        order_id: order.id,
        retry_count: 1,
        result_summary: {},
      },
    }));
    confirm.mockResolvedValueOnce({
      idempotent: true,
      payment_recorded: true,
      fulfilled: true,
      recoverable: false,
      entitlement_event_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      entitlement_status: "active",
      failure_code: null,
    });

    const retry = await service.handle({
      rawBody,
      contentType: "application/json",
      query,
      requestId: "request-completion-crash-2",
    });
    expect(retry.body).toEqual({ ErrCode: 0, ErrMsg: "success" });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(markProcessed).toHaveBeenCalledTimes(2);
  });

  test("does not downgrade a processed fact when a duplicate payload conflicts", async () => {
    createOrGet.mockImplementationOnce(async (input) => ({
      created: false,
      record: {
        id: "99999999-9999-4999-8999-999999999999",
        event_key: input.eventKey,
        payload_sha256: "0".repeat(64),
        status: "processed" as const,
        order_id: order.id,
        retry_count: 0,
        result_summary: { fulfilled: true },
      },
    }));

    const result = await (await createService()).handle({
      rawBody,
      contentType: "application/json",
      query,
      requestId: "request-conflict",
    });

    expect(result).toMatchObject({
      body: { ErrCode: 1, ErrMsg: "retry" },
      errorCode: "WECHAT_VIRTUAL_MESSAGE_EVENT_CONFLICT",
    });
    expect(markFailed).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  test("persists grant_failed and returns a retry ack without losing the paid fact", async () => {
    confirm.mockResolvedValueOnce({
      idempotent: false,
      payment_recorded: true,
      fulfilled: false,
      recoverable: true,
      entitlement_event_id: null,
      entitlement_status: null,
      failure_code: "BRANDING_VIRTUAL_ENTITLEMENT_GRANT_FAILED",
    });

    const result = await (await createService()).handle({
      rawBody,
      contentType: "application/json",
      query,
      requestId: "request-4",
    });

    expect(result.body).toEqual({ ErrCode: 1, ErrMsg: "retry" });
    expect(markFailed).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: "BRANDING_VIRTUAL_ENTITLEMENT_GRANT_FAILED",
      orderId: order.id,
    }));
  });

  test("turns a temporary database failure into the official retry response", async () => {
    createOrGet.mockRejectedValueOnce(Errors.dbError("临时数据库故障"));
    const result = await (await createService()).handle({
      rawBody,
      contentType: "application/json",
      query,
      requestId: "request-5",
    });

    expect(result).toMatchObject({
      httpStatus: 200,
      body: { ErrCode: 1, ErrMsg: "retry" },
      errorCode: "DB_ERROR",
    });
  });
});
