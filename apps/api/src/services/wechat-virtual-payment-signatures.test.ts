import { describe, expect, test } from "bun:test";

import {
  buildVirtualPaymentRequest,
  calculateVirtualPaymentPaySig,
  calculateVirtualPaymentUserSignature,
} from "./wechat-virtual-payment-signatures";

/*
 * 2026-08-01 官方契约核对：
 * https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment.html
 * https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html
 */
const OFFICIAL_BODY = '{"openid": "xxx", "user_ip": "127.0.0.1", "env": 0}';

const productionInput = {
  environment: "production" as const,
  signingSecret: {
    environment: "production" as const,
    appKey: "production-app-key",
  },
  sessionKey: "test-session-key",
  offerId: "offer-annual",
  productId: "branding-annual",
  goodsPrice: 100,
  outTradeNo: "VP202608010001",
  attach: "tenant-order-link",
};

describe("wechat virtual payment signatures", () => {
  test("matches the official signing vectors without normalizing body spaces", () => {
    expect(calculateVirtualPaymentPaySig(
      "/xpay/query_user_balance",
      OFFICIAL_BODY,
      "12345",
    )).toBe(
      "c37809f27c6d7fd1837ad2500a04512b66b34fd793a39a385fade56dca89a4b5",
    );
    expect(calculateVirtualPaymentUserSignature(
      OFFICIAL_BODY,
      "9hAb/NEYUlkaMBEsmFgzig==",
    )).toBe(
      "089d9e8dc5d308977360c4b79ec600a93d736802802a807d634192328032f6c7",
    );
  });

  test("builds the exact official short-series request from one signData string", () => {
    const result = buildVirtualPaymentRequest(productionInput);
    const expectedSignData = JSON.stringify({
      offerId: "offer-annual",
      buyQuantity: 1,
      env: 0,
      currencyType: "CNY",
      productId: "branding-annual",
      goodsPrice: 100,
      outTradeNo: "VP202608010001",
      attach: "tenant-order-link",
    });

    expect(result).toEqual({
      signData: expectedSignData,
      paySig: calculateVirtualPaymentPaySig(
        "requestVirtualPayment",
        expectedSignData,
        "production-app-key",
      ),
      signature: calculateVirtualPaymentUserSignature(
        expectedSignData,
        "test-session-key",
      ),
      mode: "short_series_goods",
    });
    expect(Object.keys(result)).toEqual([
      "signData",
      "paySig",
      "signature",
      "mode",
    ]);
  });

  test("preserves spaces in payload strings and signs the returned serialization", () => {
    const result = buildVirtualPaymentRequest({
      ...productionInput,
      attach: "tenant link with spaces",
    });

    expect(result.signData).toContain('"attach":"tenant link with spaces"');
    expect(result.paySig).toBe(calculateVirtualPaymentPaySig(
      "requestVirtualPayment",
      result.signData,
      productionInput.signingSecret.appKey,
    ));
    expect(result.signature).toBe(calculateVirtualPaymentUserSignature(
      result.signData,
      productionInput.sessionKey,
    ));
  });

  test("derives env from environment and rejects a cross-environment AppKey", () => {
    const sandboxResult = buildVirtualPaymentRequest({
      ...productionInput,
      environment: "sandbox",
      signingSecret: {
        environment: "sandbox",
        appKey: "sandbox-app-key",
      },
    });
    expect(JSON.parse(sandboxResult.signData)).toMatchObject({ env: 1 });

    expect(() => buildVirtualPaymentRequest({
      ...productionInput,
      environment: "sandbox",
    })).toThrow(expect.objectContaining({
      statusCode: 409,
      code: "WECHAT_VIRTUAL_PAYMENT_APP_KEY_ENVIRONMENT_MISMATCH",
    }));
  });

  test("returns no AppKey or session key", () => {
    const result = buildVirtualPaymentRequest(productionInput);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(productionInput.signingSecret.appKey);
    expect(serialized).not.toContain(productionInput.sessionKey);
  });

  test.each([
    ["too short", "ABC1234"],
    ["too long", "A".repeat(33)],
    ["underscore prefix", "_ABC12345"],
    ["unsupported punctuation", "ABC/12345"],
  ])("rejects an outTradeNo that is %s", (_label, outTradeNo) => {
    expect(() => buildVirtualPaymentRequest({
      ...productionInput,
      outTradeNo,
    })).toThrow(expect.objectContaining({
      statusCode: 400,
      code: "WECHAT_VIRTUAL_PAYMENT_REQUEST_INVALID",
    }));
  });

  test.each([99, 100.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid goods price %p",
    (goodsPrice) => {
      expect(() => buildVirtualPaymentRequest({
        ...productionInput,
        goodsPrice,
      })).toThrow(expect.objectContaining({
        statusCode: 400,
        code: "WECHAT_VIRTUAL_PAYMENT_REQUEST_INVALID",
      }));
    },
  );

  test.each([
    ["offerId", ""],
    ["offerId", "o".repeat(129)],
    ["productId", ""],
    ["productId", "p".repeat(129)],
    ["attach", ""],
  ])("rejects invalid %s input", (field, value) => {
    expect(() => buildVirtualPaymentRequest({
      ...productionInput,
      [field]: value,
    })).toThrow(expect.objectContaining({
      statusCode: 400,
      code: "WECHAT_VIRTUAL_PAYMENT_REQUEST_INVALID",
    }));
  });

  test("accepts the internal defensive boundaries", () => {
    expect(() => buildVirtualPaymentRequest({
      ...productionInput,
      signingSecret: {
        environment: "production",
        appKey: "a".repeat(512),
      },
      sessionKey: "s".repeat(512),
      goodsPrice: 2_147_483_647,
      outTradeNo: "O".repeat(32),
      attach: "x".repeat(1_024),
    })).not.toThrow();
  });

  test.each([
    ["AppKey", { signingSecret: {
      environment: "production" as const,
      appKey: "a".repeat(513),
    } }],
    ["sessionKey", { sessionKey: "s".repeat(513) }],
    ["attach", { attach: "x".repeat(1_025) }],
    ["goodsPrice", { goodsPrice: 2_147_483_648 }],
  ])("rejects %s beyond the internal defensive boundary", (_label, patch) => {
    const invalidInput = Object.assign({ ...productionInput }, patch);
    expect(() => buildVirtualPaymentRequest(invalidInput)).toThrow(
      expect.objectContaining({
        statusCode: 400,
        code: "WECHAT_VIRTUAL_PAYMENT_REQUEST_INVALID",
      }),
    );
  });
});
