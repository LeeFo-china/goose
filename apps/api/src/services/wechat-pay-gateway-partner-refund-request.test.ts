import { describe, expect, mock, test } from "bun:test";
import { createVerify, generateKeyPairSync, sign } from "node:crypto";

import type { WechatPayJsapiConfig } from "@/services/wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";
import { buildWechatPayRequestSignMessage } from "@/services/wechat-pay-signatures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const RESPONSE_TIMESTAMP = "1782873600";
const RESPONSE_NONCE = "response-nonce";
const PUBLIC_KEY_ID = "PUB_KEY_ID_TEST";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const partnerConfig = {
  merchant_mode: "service_provider_sub_merchant",
  merchant_id: "1561816121",
  sub_merchant_id: "1900000109",
  app_id: "wx-service-app",
  sub_app_id: "wx-sub-app",
  serial_no: "SERIALNO",
  notify_url: "https://api.example.com/pay/wechat/callback",
} satisfies WechatPayJsapiConfig;
const secretBundle = {
  privateKeyPem: privateKey,
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: PUBLIC_KEY_ID,
  wechatPayPublicKeyPem: publicKey,
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPaySecretBundle;

describe("WechatPayGateway partner refund request", () => {
  test("sends only sub_mchid in the body and signs as the service provider", async () => {
    const urlPath = "/v3/refund/domestic/refunds";
    const expectedBody = JSON.stringify({
      sub_mchid: "1900000109",
      transaction_id: "4200000000202607010000000001",
      out_refund_no: "TRR202607100800000001",
      reason: "客户误充值，需要申请退款",
      amount: { refund: 10000, total: 10000, currency: "CNY" },
      notify_url: "https://api.example.com/pay/wechat/callback",
    });
    const fetchImpl = mock(async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      expect(String(url)).toBe(`${secretBundle.baseUrl}${urlPath}`);
      expect(init?.body).toBe(expectedBody);
      const authorization = String(
        (init?.headers as Record<string, string>).Authorization,
      );
      expect(authorization).toContain('mchid="1561816121"');
      const signature = authorization.match(/signature="([^"]+)"/)?.[1] ?? "";
      const verifier = createVerify("RSA-SHA256");
      verifier.update(buildWechatPayRequestSignMessage({
        method: "POST",
        urlPath,
        body: expectedBody,
        nonce: "nonce-1",
        timestamp: RESPONSE_TIMESTAMP,
      }));
      verifier.end();
      expect(verifier.verify(publicKey, signature, "base64")).toBe(true);
      return signedJsonResponse({
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
      });
    }) as unknown as typeof fetch;
    const { WechatPayGateway } = await import("./wechat-pay-gateway");
    const gateway = new WechatPayGateway({
      fetchImpl,
      nonceFactory: () => "nonce-1",
      timestampFactory: () => RESPONSE_TIMESTAMP,
      nowSecondsFactory: () => Number(RESPONSE_TIMESTAMP),
    });

    await gateway.requestRefund({
      config: partnerConfig,
      transactionId: "4200000000202607010000000001",
      outRefundNo: "TRR202607100800000001",
      reason: "客户误充值，需要申请退款",
      refundAmountFen: 10000,
      totalAmountFen: 10000,
      secretBundle,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

function signedJsonResponse(payload: Record<string, unknown>): Response {
  const rawBody = JSON.stringify(payload);
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${RESPONSE_TIMESTAMP}\n${RESPONSE_NONCE}\n${rawBody}\n`),
    privateKey,
  ).toString("base64");
  return new Response(rawBody, {
    headers: {
      "content-type": "application/json",
      "request-id": "wechat-request-id",
      "wechatpay-timestamp": RESPONSE_TIMESTAMP,
      "wechatpay-nonce": RESPONSE_NONCE,
      "wechatpay-serial": PUBLIC_KEY_ID,
      "wechatpay-signature": signature,
    },
  });
}
