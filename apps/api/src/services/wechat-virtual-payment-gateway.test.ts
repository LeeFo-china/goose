import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";

import type {
  CredentialInvalidationPort,
  QueryVirtualOrderInput,
  RefundVirtualOrderInput,
  WechatVirtualPaymentFetch,
} from "./wechat-virtual-payment-gateway-contracts";
import { WechatVirtualPaymentGateway } from "./wechat-virtual-payment-gateway";
import {
  calculateVirtualPaymentPaySig,
  calculateVirtualPaymentUserSignature,
} from "./wechat-virtual-payment-signatures";

/*
 * 2026-08-01 官方契约核对：
 * https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_query_order.html
 * https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_refund_order.html
 * https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_notify_provide_goods.html
 * refund 页面调用 URL/参数表只列 pay_sig，但同页注意事项要求用户态签名与支付签名；
 * 本测试采用更严格的双签名要求。
 */
const BASE_URL = "https://xpay.test";
const OFFICIAL_BASE_URL = "https://api.weixin.qq.com";
const ACCESS_TOKEN = "access+/token=";
const OPENID = "openid-sensitive";
const APP_KEY = "production-app-key";
const SESSION_KEY = "session-key-sensitive";

const queryInput: QueryVirtualOrderInput = {
  accessToken: ACCESS_TOKEN,
  openid: OPENID,
  environment: "production",
  signingSecret: { environment: "production", appKey: APP_KEY },
  orderId: "VP202608010001",
};

const refundInput: RefundVirtualOrderInput = {
  ...queryInput,
  sessionKey: SESSION_KEY,
  credential: {
    userId: "00000000-0000-4000-8000-000000000001",
    credentialId: "00000000-0000-4000-8000-000000000002",
    sessionRevision: 3,
  },
  refundOrderId: "RF202608010001",
  leftFee: 100,
  refundFee: 100,
  bizMeta: "platform-refund",
  refundReason: "3",
  requestSource: "1",
};

const querySuccessPayload = {
  errcode: 0,
  errmsg: "",
  order: {
    order_id: "VP202608010001",
    create_time: 1_754_000_000,
    update_time: 1_754_000_010,
    status: 2,
    biz_type: 0,
    order_fee: 100,
    coupon_fee: 0,
    paid_fee: 100,
    order_type: 0,
    refund_fee: 0,
    paid_time: 1_754_000_005,
    provide_time: 0,
    biz_meta: "must-not-return",
    env_type: 1,
    token: "must-not-return-token",
    left_fee: 100,
    wx_order_id: "420000000000000001",
    channel_order_id: "channel-order-id",
    wxpay_order_id: "wechat-pay-order-id",
    sett_time: 1_754_000_020,
    sett_state: 2,
    platform_fee_fen: 5,
    cps_fee_fen: 0,
  },
};

type CapturedRequest = { url: string; init: RequestInit | undefined };

function responseFetch(
  responseFactory: () => Response,
  captured: CapturedRequest[] = [],
): { fetchImpl: WechatVirtualPaymentFetch; captured: CapturedRequest[] } {
  const fetchImpl: WechatVirtualPaymentFetch = mock(async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    captured.push({ url: String(input), init });
    return responseFactory();
  });
  return { fetchImpl, captured };
}

function successfulInvalidation(): CredentialInvalidationPort {
  return {
    invalidate: mock(async () => ({
      credentialId: refundInput.credential.credentialId,
      oauthIdentityId: "00000000-0000-4000-8000-000000000003",
      sessionRevision: refundInput.credential.sessionRevision,
      status: "invalid" as const,
      obtainedAt: "2026-08-01T00:00:00.000Z",
    })),
  };
}

function createGateway(input: {
  response?: () => Response;
  fetchImpl?: WechatVirtualPaymentFetch;
  credentialInvalidation?: CredentialInvalidationPort;
  useOfficialBaseUrl?: boolean;
} = {}) {
  const mocked = input.fetchImpl
    ? { fetchImpl: input.fetchImpl, captured: [] }
    : responseFetch(input.response ?? (() => Response.json(querySuccessPayload)));
  return {
    gateway: new WechatVirtualPaymentGateway({
      fetchImpl: mocked.fetchImpl,
      ...(input.useOfficialBaseUrl ? {} : { baseUrl: BASE_URL }),
      credentialInvalidation:
        input.credentialInvalidation ?? successfulInvalidation(),
    }),
    captured: mocked.captured,
  };
}

describe("WechatVirtualPaymentGateway official request contracts", () => {
  test("sends query_order with only access_token and pay_sig", async () => {
    const { gateway, captured } = createGateway({ useOfficialBaseUrl: true });
    const result = await gateway.queryOrder(queryInput);
    const expectedBody = JSON.stringify({
      openid: OPENID,
      env: 0,
      order_id: "VP202608010001",
    });
    const expectedPaySig = calculateVirtualPaymentPaySig(
      "/xpay/query_order",
      expectedBody,
      APP_KEY,
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]?.url).toBe(
      `${OFFICIAL_BASE_URL}/xpay/query_order?access_token=access%2B%2Ftoken%3D&pay_sig=${expectedPaySig}`,
    );
    expect(captured[0]?.init).toMatchObject({
      method: "POST",
      body: expectedBody,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    expect(captured[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      requestId: null,
      environment: "production",
      orderId: "VP202608010001",
      status: 2,
      businessType: 0,
      orderType: 0,
      orderFee: 100,
      couponFee: 0,
      paidFee: 100,
      refundFee: 0,
      leftFee: 100,
      createdAt: 1_754_000_000,
      updatedAt: 1_754_000_010,
      paidAt: 1_754_000_005,
      providedAt: 0,
      wechatOrderId: "420000000000000001",
      channelOrderId: "channel-order-id",
      wechatPayOrderId: "wechat-pay-order-id",
      settledAt: 1_754_000_020,
      settlementState: 2,
      platformFeeFen: 5,
      cpsFeeFen: 0,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("must-not-return");
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain(OPENID);
    expect(serialized).not.toContain(APP_KEY);
  });

  test("sends refund_order with signatures over the exact transmitted body", async () => {
    const response = () => Response.json({
      errcode: 0,
      errmsg: "",
      refund_order_id: "RF202608010001",
      refund_wx_order_id: "refund-wx-id",
      pay_order_id: "VP202608010001",
      pay_wx_order_id: "420000000000000001",
    });
    const { gateway, captured } = createGateway({ response });
    const result = await gateway.refundOrder(refundInput);
    const expectedBody = JSON.stringify({
      openid: OPENID,
      order_id: "VP202608010001",
      refund_order_id: "RF202608010001",
      left_fee: 100,
      refund_fee: 100,
      biz_meta: "platform-refund",
      refund_reason: "3",
      req_from: "1",
      env: 0,
    });
    const paySig = calculateVirtualPaymentPaySig(
      "/xpay/refund_order",
      expectedBody,
      APP_KEY,
    );
    const signature = calculateVirtualPaymentUserSignature(
      expectedBody,
      SESSION_KEY,
    );

    expect(captured[0]?.url).toBe(
      `${BASE_URL}/xpay/refund_order?access_token=access%2B%2Ftoken%3D&pay_sig=${paySig}&signature=${signature}`,
    );
    expect(captured[0]?.init?.body).toBe(expectedBody);
    expect(result).toEqual({
      status: "submitted",
      requestId: null,
      refundOrderId: "RF202608010001",
      refundWechatOrderId: "refund-wx-id",
      payOrderId: "VP202608010001",
      payWechatOrderId: "420000000000000001",
    });
  });

  test("sends notify_provide_goods with access_token only and accepts empty success", async () => {
    const { gateway, captured } = createGateway({
      response: () => new Response("", { status: 200 }),
    });
    const result = await gateway.notifyProvideGoods({
      accessToken: ACCESS_TOKEN,
      environment: "sandbox",
      wechatOrderId: "420000000000000001",
    });

    expect(captured[0]?.url).toBe(
      `${BASE_URL}/xpay/notify_provide_goods?access_token=access%2B%2Ftoken%3D`,
    );
    expect(captured[0]?.init?.body).toBe(JSON.stringify({
      wx_order_id: "420000000000000001",
      env: 1,
    }));
    expect(result).toEqual({ accepted: true, requestId: null });
  });
});

describe("WechatVirtualPaymentGateway failures and validation", () => {
  test("wraps non-2xx details without leaking upstream secrets", async () => {
    const requestId = "R".repeat(200);
    const { gateway } = createGateway({
      response: () => Response.json(
        { errcode: 40013, errmsg: `bad ${ACCESS_TOKEN} ${OPENID}` },
        { status: 401, headers: { "request-id": requestId } },
      ),
    });

    const error = await gateway.queryOrder(queryInput).catch((caught) => caught);
    expect(error).toMatchObject({
      statusCode: 502,
      code: "WECHAT_VIRTUAL_PAYMENT_HTTP_ERROR",
      details: {
        httpStatus: 401,
        wechatErrcode: 40013,
        requestId: null,
      },
    });
    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain(OPENID);
    expect(serialized).not.toContain("bad");
  });

  test.each([
    ["timeout", new DOMException("timed out", "TimeoutError"), 504,
      "WECHAT_VIRTUAL_PAYMENT_GATEWAY_TIMEOUT"],
    ["network", new Error(`failed ${BASE_URL}?access_token=${ACCESS_TOKEN}`), 502,
      "WECHAT_VIRTUAL_PAYMENT_TRANSPORT_FAILED"],
  ])("wraps a %s failure without propagating fetch messages", async (
    _label,
    cause,
    statusCode,
    code,
  ) => {
    const fetchImpl: WechatVirtualPaymentFetch = mock(async () => {
      throw cause;
    });
    const { gateway } = createGateway({ fetchImpl });

    const error = await gateway.queryOrder(queryInput).catch((caught) => caught);
    expect(error).toMatchObject({
      statusCode,
      code,
      details: {
        httpStatus: null,
        wechatErrcode: null,
        requestId: null,
      },
    });
    expect(JSON.stringify(error)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(error)).not.toContain(BASE_URL);
  });

  test.each([
    ["invalid JSON", () => new Response("{", { status: 200 })],
    ["uppercase callback fields", () => Response.json({ ErrCode: 0, ErrMsg: "" })],
    ["invalid order schema", () => Response.json({
      ...querySuccessPayload,
      order: { ...querySuccessPayload.order, status: "2" },
    })],
    ["unsupported business type", () => Response.json({
      ...querySuccessPayload,
      order: { ...querySuccessPayload.order, biz_type: 1 },
    })],
  ])("rejects %s as an invalid response", async (_label, response) => {
    const { gateway } = createGateway({ response });

    await expect(gateway.queryOrder(queryInput)).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_VIRTUAL_PAYMENT_RESPONSE_INVALID",
    });
  });

  test("marks only refund session error 268490009 invalid and returns 409", async () => {
    const invalidate = mock(async () => ({
      credentialId: refundInput.credential.credentialId,
      oauthIdentityId: "00000000-0000-4000-8000-000000000003",
      sessionRevision: 3,
      status: "invalid" as const,
      obtainedAt: "2026-08-01T00:00:00.000Z",
    }));
    const { gateway } = createGateway({
      response: () => Response.json({
        errcode: 268490009,
        errmsg: `expired ${SESSION_KEY}`,
      }),
      credentialInvalidation: { invalidate },
    });

    await expect(gateway.refundOrder(refundInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
    });
    expect(invalidate).toHaveBeenCalledWith({
      userId: refundInput.credential.userId,
      openid: refundInput.openid,
      credentialId: refundInput.credential.credentialId,
      sessionRevision: refundInput.credential.sessionRevision,
    });
  });

  test("keeps a credential invalidation failure as a sanitized 5xx", async () => {
    const { gateway } = createGateway({
      response: () => Response.json({ errcode: 268490009, errmsg: "expired" }),
      credentialInvalidation: {
        invalidate: mock(async () => {
          throw Errors.dbError(`failed to persist ${SESSION_KEY}`);
        }),
      },
    });

    const error = await gateway.refundOrder(refundInput).catch((caught) => caught);
    expect(error).toMatchObject({
      statusCode: 500,
      code: "WECHAT_VIRTUAL_PAYMENT_SESSION_INVALIDATION_FAILED",
    });
    expect(JSON.stringify(error)).not.toContain(SESSION_KEY);
  });

  test("does not invalidate a query_order response with the same code", async () => {
    const invalidate = mock(async () => {
      throw new Error("must not be called");
    });
    const { gateway } = createGateway({
      response: () => Response.json({ errcode: 268490009, errmsg: "expired" }),
      credentialInvalidation: { invalidate },
    });

    await expect(gateway.queryOrder(queryInput)).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_VIRTUAL_PAYMENT_UPSTREAM_REJECTED",
      details: { wechatErrcode: 268490009 },
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  test.each([
    ["neither order id", {}],
    ["both order ids", {
      orderId: "VP202608010001",
      wechatOrderId: "wx-id",
    }],
  ])("rejects %s before sending a request", async (_label, reference) => {
    const { gateway, captured } = createGateway();

    await expect(gateway.queryOrder({
      ...queryInput,
      orderId: undefined,
      ...reference,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "WECHAT_VIRTUAL_PAYMENT_REQUEST_INVALID",
    });
    expect(captured).toHaveLength(0);
  });

  test.each([
    ["refund order length", { refundOrderId: "SHORT" }],
    ["refund order characters", { refundOrderId: "RF/202608010001" }],
    ["zero refund", { refundFee: 0 }],
    ["refund over remaining amount", { refundFee: 101 }],
    ["oversized metadata", { bizMeta: "x".repeat(1_025) }],
    ["refund reason", { refundReason: "6" }],
    ["request source", { requestSource: "4" }],
  ])("rejects invalid %s", async (_label, patch) => {
    const { gateway, captured } = createGateway();

    const invalidInput = Object.assign({ ...refundInput }, patch);
    await expect(gateway.refundOrder(invalidInput)).rejects.toMatchObject({
      statusCode: 400,
      code: "WECHAT_VIRTUAL_PAYMENT_REQUEST_INVALID",
    });
    expect(captured).toHaveLength(0);
  });

  test("rejects an AppKey tagged for the other environment", async () => {
    const { gateway, captured } = createGateway();

    await expect(gateway.queryOrder({
      ...queryInput,
      environment: "sandbox",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_VIRTUAL_PAYMENT_APP_KEY_ENVIRONMENT_MISMATCH",
    });
    expect(captured).toHaveLength(0);
  });

  test("wraps a missing signing secret as an input error", async () => {
    const { gateway, captured } = createGateway();
    const invalidInput = { ...queryInput };
    Reflect.deleteProperty(invalidInput, "signingSecret");

    await expect(gateway.queryOrder(invalidInput)).rejects.toMatchObject({
      statusCode: 400,
      code: "WECHAT_VIRTUAL_PAYMENT_REQUEST_INVALID",
    });
    expect(captured).toHaveLength(0);
  });
});
