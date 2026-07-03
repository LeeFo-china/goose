import { describe, expect, test } from "bun:test";
import { createVerify, generateKeyPairSync } from "node:crypto";
import {
  buildWechatPayAuthorization,
  buildWechatPayRequestSignMessage,
  buildWechatPayMiniProgramPaymentRequest,
  buildWechatPayMiniProgramSignMessage,
} from "./wechat-pay-signatures";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

describe("wechat pay signatures", () => {
  test("builds verifiable request authorization header", () => {
    const authorization = buildWechatPayAuthorization({
      method: "POST",
      urlPath: "/v3/pay/partner/transactions/jsapi",
      body: "{\"out_trade_no\":\"WX202607010001\"}",
      merchantId: "1561816121",
      serialNo: "SERIALNO",
      privateKeyPem: privateKey,
      nonce: "nonce-1",
      timestamp: "1782873600",
    });

    expect(authorization).toStartWith("WECHATPAY2-SHA256-RSA2048 ");
    expect(authorization).toMatch(
      /^WECHATPAY2-SHA256-RSA2048 mchid="1561816121",nonce_str="nonce-1",signature="[^"]+",timestamp="1782873600",serial_no="SERIALNO"$/,
    );
    expect(authorization).toContain('mchid="1561816121"');
    expect(authorization).toContain('serial_no="SERIALNO"');
    expect(authorization).toContain('nonce_str="nonce-1"');
    expect(authorization).toContain('timestamp="1782873600"');

    const signature = extractHeaderValue(authorization, "signature");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(buildWechatPayRequestSignMessage({
      method: "POST",
      urlPath: "/v3/pay/partner/transactions/jsapi",
      body: "{\"out_trade_no\":\"WX202607010001\"}",
      nonce: "nonce-1",
      timestamp: "1782873600",
    }));
    verifier.end();

    expect(verifier.verify(publicKey, signature, "base64")).toBe(true);
  });

  test("builds verifiable mini program payment request", () => {
    const paymentRequest = buildWechatPayMiniProgramPaymentRequest({
      appId: "wxbac3b1e168fd968a",
      prepayId: "wx201410272009395522657a690389285100",
      privateKeyPem: privateKey,
      nonce: "nonce-2",
      timestamp: "1782873601",
    });

    expect(paymentRequest).toMatchObject({
      timeStamp: "1782873601",
      nonceStr: "nonce-2",
      package: "prepay_id=wx201410272009395522657a690389285100",
      signType: "RSA",
    });

    const verifier = createVerify("RSA-SHA256");
    verifier.update(buildWechatPayMiniProgramSignMessage({
      appId: "wxbac3b1e168fd968a",
      timestamp: "1782873601",
      nonce: "nonce-2",
      packageValue: paymentRequest.package,
    }));
    verifier.end();

    expect(verifier.verify(publicKey, paymentRequest.paySign, "base64")).toBe(true);
  });
});

function extractHeaderValue(header: string, key: string) {
  const match = header.match(new RegExp(`${key}="([^"]+)"`));
  if (!match?.[1]) throw new Error(`missing ${key}`);
  return match[1];
}
