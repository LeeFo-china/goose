import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  buildWechatMessageSignature,
  parseWechatVirtualPaymentMessage,
  verifyWechatMessageSignature,
} from "./wechat-virtual-payment-message";

describe("WeChat virtual-payment message protocol", () => {
  test("verifies the official token/timestamp/nonce SHA-1 signature", () => {
    const token = "AAAAA";
    const timestamp = "1714036504";
    const nonce = "1514711492";
    const expected = createHash("sha1")
      .update([token, timestamp, nonce].sort().join(""))
      .digest("hex");

    expect(buildWechatMessageSignature({ token, timestamp, nonce })).toBe(expected);
    expect(verifyWechatMessageSignature({
      token,
      timestamp,
      nonce,
      signature: expected,
    })).toBe(true);
    expect(verifyWechatMessageSignature({
      token,
      timestamp,
      nonce,
      signature: "0".repeat(40),
    })).toBe(false);
  });

  test.each([
    ["json", "application/json", JSON.stringify({
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
    })],
    ["xml", "application/xml", [
      "<xml>",
      "<ToUserName><![CDATA[gh_original]]></ToUserName>",
      "<FromUserName><![CDATA[official-openid]]></FromUserName>",
      "<CreateTime>1714037059</CreateTime>",
      "<MsgType><![CDATA[event]]></MsgType>",
      "<Event><![CDATA[xpay_goods_deliver_notify]]></Event>",
      "<OpenId><![CDATA[payer-openid]]></OpenId>",
      "<OutTradeNo><![CDATA[BV202608010001]]></OutTradeNo>",
      "<Env>0</Env>",
      "<WeChatPayInfo>",
      "<MchOrderNo><![CDATA[provider-order-1]]></MchOrderNo>",
      "<TransactionId><![CDATA[transaction-1]]></TransactionId>",
      "<PaidTime>1714037060</PaidTime>",
      "</WeChatPayInfo>",
      "<GoodsInfo>",
      "<ProductId><![CDATA[branding-annual]]></ProductId>",
      "<Quantity>1</Quantity><OrigPrice>100</OrigPrice><ActualPrice>100</ActualPrice>",
      "<Attach><![CDATA[aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]></Attach>",
      "</GoodsInfo>",
      "</xml>",
    ].join("")],
  ] as const)("parses the bounded official %s goods-delivery payload", (
    format,
    contentType,
    rawBody,
  ) => {
    const parsed = parseWechatVirtualPaymentMessage({ contentType, rawBody });

    expect(parsed).toMatchObject({
      format,
      eventType: "xpay_goods_deliver_notify",
      toUserName: "gh_original",
      openid: "payer-openid",
      outTradeNo: "BV202608010001",
      environment: "production",
      providerOrderNo: "provider-order-1",
      transactionId: "transaction-1",
      providerProductId: "branding-annual",
      quantity: 1,
      origPriceFen: 100,
      actualPriceFen: 100,
    });
  });

  test("rejects XML entities and oversized payloads before normalization", () => {
    expect(() => parseWechatVirtualPaymentMessage({
      contentType: "application/xml",
      rawBody: "<!DOCTYPE xml [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><xml/>",
    })).toThrow();
    expect(() => parseWechatVirtualPaymentMessage({
      contentType: "application/json",
      rawBody: "x".repeat(65_537),
    })).toThrow();
  });
});
