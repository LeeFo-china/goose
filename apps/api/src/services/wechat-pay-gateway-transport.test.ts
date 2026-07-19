import { describe, expect, mock, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import type { WechatPayJsapiConfig } from "./wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const RESPONSE_TIMESTAMP = "1782873600";
const directConfig = {
  merchant_mode: "direct_merchant",
  merchant_id: "1112582521",
  sub_merchant_id: null,
  app_id: "wxbac3b1e168fd968a",
  sub_app_id: null,
  serial_no: "SERIALNO",
  notify_url: "https://api.example.com/pay/wechat/callback",
} satisfies WechatPayJsapiConfig;
const secretBundle = {
  privateKeyPem: privateKey,
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
  wechatPayPublicKeyPem: publicKey,
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPaySecretBundle;

function createWechatPayResponse(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  const nonce = "response-nonce";
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${RESPONSE_TIMESTAMP}\n${nonce}\n${rawBody}\n`),
    privateKey,
  ).toString("base64");
  return new Response(rawBody, {
    headers: {
      "request-id": "wechat-request-id",
      "wechatpay-timestamp": RESPONSE_TIMESTAMP,
      "wechatpay-nonce": nonce,
      "wechatpay-serial": "PUB_KEY_ID_TEST",
      "wechatpay-signature": signature,
    },
  });
}

async function createGateway(fetchImpl: typeof fetch) {
  const { WechatPayGateway } = await import("./wechat-pay-gateway");
  return new WechatPayGateway({
    fetchImpl,
    nonceFactory: () => "nonce-1",
    timestampFactory: () => RESPONSE_TIMESTAMP,
    nowSecondsFactory: () => Number(RESPONSE_TIMESTAMP),
  });
}

describe("WechatPayGateway bounded transport", () => {
  test("maps a rejected fetch to a stable transaction transport error", async () => {
    const fetchImpl = mock(async () => {
      throw new TypeError("network unavailable");
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(gateway.queryTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX202607010001",
      secretBundle,
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_TRANSPORT_FAILED",
      details: expect.objectContaining({ operation: "transaction_query" }),
    });
  });

  test("maps a response body stream failure to a stable transport error", async () => {
    const response = createWechatPayResponse({});
    Object.defineProperty(response, "text", {
      value: async () => {
        throw new TypeError("response stream failed");
      },
    });
    const gateway = await createGateway(mock(async () => response) as unknown as typeof fetch);

    await expect(gateway.queryTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX202607010001",
      secretBundle,
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_TRANSPORT_FAILED",
      details: expect.objectContaining({
        operation: "transaction_query",
        requestId: "wechat-request-id",
      }),
    });
  });

  test("aborts a refund request that exceeds the transport timeout", async () => {
    const fetchImpl = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal;
      if (!signal) throw new Error("abort signal missing");
      const response = createWechatPayResponse({ status: "PROCESSING" });
      Object.defineProperty(response, "text", {
        value: () => new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
      });
      return response;
    }) as unknown as typeof fetch;
    const { WechatPayGateway } = await import("./wechat-pay-gateway");
    const gateway = new WechatPayGateway({
      fetchImpl,
      nonceFactory: () => "nonce-1",
      timestampFactory: () => RESPONSE_TIMESTAMP,
      requestTimeoutMs: 5,
      nowSecondsFactory: () => Number(RESPONSE_TIMESTAMP),
    });

    await expect(gateway.requestRefund({
      config: directConfig,
      transactionId: "4200000000202607010000000001",
      outRefundNo: "TRR202607100800000001",
      reason: "客户误充值，需要申请退款",
      refundAmountFen: 10000,
      totalAmountFen: 10000,
      secretBundle,
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_TRANSPORT_TIMEOUT",
      details: expect.objectContaining({ operation: "refund_request" }),
    });
  });
});
