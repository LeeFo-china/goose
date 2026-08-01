import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import {
  BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED,
} from "@/services/branding-virtual-payment-contracts";

import type {
  CredentialInvalidationPort,
  QueryVirtualOrderInput,
  RefundVirtualOrderInput,
  WechatVirtualPaymentFetch,
} from "./wechat-virtual-payment-gateway-contracts";
import { WechatVirtualPaymentGateway } from "./wechat-virtual-payment-gateway";

const queryInput: QueryVirtualOrderInput = {
  accessToken: "access-token",
  openid: "openid",
  environment: "production",
  signingSecret: { environment: "production", appKey: "app-key" },
  orderId: "VP202608010001",
};

const refundInput: RefundVirtualOrderInput = {
  ...queryInput,
  sessionKey: "session-key",
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

function queryPayload(input: {
  orderId?: string;
  wechatOrderId?: string;
} = {}) {
  return {
    errcode: 0,
    errmsg: "",
    order: {
      order_id: input.orderId ?? "VP202608010001",
      create_time: 1,
      update_time: 2,
      status: 2,
      biz_type: 0,
      order_fee: 100,
      coupon_fee: 0,
      paid_fee: 100,
      order_type: 0,
      refund_fee: 0,
      paid_time: 2,
      provide_time: 0,
      biz_meta: "not-returned",
      env_type: 1,
      token: "not-returned",
      left_fee: 100,
      wx_order_id: input.wechatOrderId ?? "wx-order-id",
      channel_order_id: "channel-id",
      wxpay_order_id: "wxpay-id",
      sett_time: 0,
      sett_state: 0,
      platform_fee_fen: 0,
      cps_fee_fen: 0,
    },
  };
}

function refundPayload() {
  return {
    errcode: 0,
    errmsg: "",
    refund_order_id: refundInput.refundOrderId,
    refund_wx_order_id: "refund-wx-id",
    pay_order_id: refundInput.orderId,
    pay_wx_order_id: "pay-wx-id",
  };
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

function gatewayWith(
  fetchImpl: WechatVirtualPaymentFetch,
  credentialInvalidation: CredentialInvalidationPort = successfulInvalidation(),
) {
  return new WechatVirtualPaymentGateway({
    fetchImpl,
    baseUrl: "https://xpay.test",
    credentialInvalidation,
  });
}

describe("WechatVirtualPaymentGateway response hardening", () => {
  test.each([
    ["TimeoutError", 504, "WECHAT_VIRTUAL_PAYMENT_GATEWAY_TIMEOUT"],
    ["AbortError", 504, "WECHAT_VIRTUAL_PAYMENT_GATEWAY_TIMEOUT"],
    ["NetworkError", 502, "WECHAT_VIRTUAL_PAYMENT_TRANSPORT_FAILED"],
  ])("classifies a %s raised after response headers", async (
    name,
    statusCode,
    code,
  ) => {
    const fetchImpl: WechatVirtualPaymentFetch = mock(async () => {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new DOMException("secret response URL", name));
        },
      }, { highWaterMark: 0 });
      return new Response(body, {
        headers: { "request-id": "safe-request-id" },
      });
    });
    const gateway = gatewayWith(fetchImpl);

    const error = await gateway.queryOrder(queryInput).catch((caught) => caught);
    expect(error).toMatchObject({
      statusCode,
      code,
      details: {
        httpStatus: 200,
        wechatErrcode: null,
        requestId: "safe-request-id",
      },
    });
    expect(JSON.stringify(error)).not.toContain("secret response URL");
  });

  test.each([
    "unsafe request id",
    "A".repeat(129),
  ])("drops an unsafe upstream request id from error details", async (requestId) => {
    const fetchImpl: WechatVirtualPaymentFetch = mock(async () => Response.json(
      { errcode: 40013, errmsg: "invalid" },
      { status: 401, headers: { "request-id": requestId } },
    ));
    const gateway = gatewayWith(fetchImpl);

    await expect(gateway.queryOrder(queryInput)).rejects.toMatchObject({
      code: "WECHAT_VIRTUAL_PAYMENT_HTTP_ERROR",
      details: { requestId: null },
    });
  });
});

describe("WechatVirtualPaymentGateway credential races", () => {
  test.each(["login rotation", "OAuth unbind"])(
    "keeps refresh-required semantics after a %s race",
    async () => {
      const fetchImpl: WechatVirtualPaymentFetch = mock(async () => Response.json({
        errcode: 268490009,
        errmsg: "session expired",
      }));
      const credentialInvalidation: CredentialInvalidationPort = {
        invalidate: mock(async () => {
          throw Errors.business(
            409,
            "微信会话已失效，请重新登录",
            BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED,
          );
        }),
      };
      const gateway = gatewayWith(fetchImpl, credentialInvalidation);

      await expect(gateway.refundOrder(refundInput)).rejects.toMatchObject({
        statusCode: 409,
        code: BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED,
      });
    },
  );

  test("does not trust a plain Error that imitates refresh-required fields", async () => {
    const fetchImpl: WechatVirtualPaymentFetch = mock(async () => Response.json({
      errcode: 268490009,
      errmsg: "session expired",
    }));
    const credentialInvalidation: CredentialInvalidationPort = {
      invalidate: mock(async () => {
        const error = new Error("not an AppError");
        Object.assign(error, {
          statusCode: 409,
          code: BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED,
        });
        throw error;
      }),
    };

    await expect(gatewayWith(fetchImpl, credentialInvalidation)
      .refundOrder(refundInput)).rejects.toMatchObject({
        statusCode: 500,
        code: "WECHAT_VIRTUAL_PAYMENT_SESSION_INVALIDATION_FAILED",
      });
  });
});

describe("WechatVirtualPaymentGateway defensive input boundaries", () => {
  test("accepts the exact query input boundaries", async () => {
    const wechatOrderId = "W".repeat(128);
    const fetchImpl: WechatVirtualPaymentFetch = mock(async () => Response.json(
      queryPayload({ orderId: "VP202608010001", wechatOrderId }),
    ));
    const gateway = gatewayWith(fetchImpl);

    await expect(gateway.queryOrder({
      accessToken: "t".repeat(4_096),
      openid: "o".repeat(128),
      environment: "production",
      signingSecret: { environment: "production", appKey: "a".repeat(512) },
      wechatOrderId,
    })).resolves.toMatchObject({ wechatOrderId });
  });

  test("accepts the PostgreSQL integer refund boundary", async () => {
    const fetchImpl: WechatVirtualPaymentFetch = mock(async () => Response.json(
      refundPayload(),
    ));

    await expect(gatewayWith(fetchImpl).refundOrder({
      ...refundInput,
      sessionKey: "s".repeat(512),
      leftFee: 2_147_483_647,
      refundFee: 2_147_483_647,
      bizMeta: "x".repeat(1_024),
    })).resolves.toMatchObject({ status: "submitted" });
  });

  test.each([
    ["accessToken", { accessToken: "t".repeat(4_097) }],
    ["openid", { openid: "o".repeat(129) }],
    ["AppKey", { signingSecret: {
      environment: "production" as const,
      appKey: "a".repeat(513),
    } }],
    ["wxOrderId", { orderId: undefined, wechatOrderId: "w".repeat(129) }],
  ])("rejects %s beyond its query boundary", async (_label, patch) => {
    const fetchImpl: WechatVirtualPaymentFetch = mock(async () => Response.json(
      queryPayload(),
    ));
    const invalidInput = Object.assign({ ...queryInput }, patch);

    await expect(gatewayWith(fetchImpl).queryOrder(invalidInput))
      .rejects.toMatchObject({
        statusCode: 400,
        code: "WECHAT_VIRTUAL_PAYMENT_REQUEST_INVALID",
      });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    ["sessionKey", { sessionKey: "s".repeat(513) }],
    ["leftFee", { leftFee: 2_147_483_648 }],
    ["refundFee", {
      leftFee: 2_147_483_648,
      refundFee: 2_147_483_648,
    }],
  ])("rejects %s beyond its refund boundary", async (_label, patch) => {
    const fetchImpl: WechatVirtualPaymentFetch = mock(async () => Response.json(
      refundPayload(),
    ));
    const invalidInput = Object.assign({ ...refundInput }, patch);

    await expect(gatewayWith(fetchImpl).refundOrder(invalidInput))
      .rejects.toMatchObject({
        statusCode: 400,
        code: "WECHAT_VIRTUAL_PAYMENT_REQUEST_INVALID",
      });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
