import { describe, expect, mock, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import type { WechatPayJsapiConfig } from "./wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";

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
const config = {
  merchant_mode: "direct_merchant",
  merchant_id: "1112582521",
  sub_merchant_id: null,
  app_id: "wx-app",
  sub_app_id: null,
  serial_no: "SERIALNO",
  notify_url: null,
} satisfies WechatPayJsapiConfig;
const secretBundle = {
  privateKeyPem: privateKey,
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: PUBLIC_KEY_ID,
  wechatPayPublicKeyPem: publicKey,
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPaySecretBundle;

describe("WechatPayGateway close timeout lifecycle", () => {
  test("times out while reading a response body after headers arrive", async () => {
    let didAbort = false;
    const fetchImpl = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const signal = requireSignal(init);
      const response = signedResponse("", 204);
      Object.defineProperty(response, "text", {
        value: () => new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            didAbort = true;
            reject(signal.reason);
          }, { once: true });
        }),
      });
      return response;
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl, 5);

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_CLOSE_FAILED",
      details: { reason: "timeout", timeout_ms: 5 },
    });
    expect(didAbort).toBe(true);
  }, 100);

  test("clears the timer after a signed empty response succeeds", async () => {
    let didAbort = false;
    const fetchImpl = observedFetch(signedResponse("", 204), () => {
      didAbort = true;
    });
    const gateway = await createGateway(fetchImpl, 20);

    await closeTransaction(gateway);
    await Bun.sleep(30);

    expect(didAbort).toBe(false);
  });

  test("clears the timer after a verified upstream error", async () => {
    let didAbort = false;
    const fetchImpl = observedFetch(signedResponse(JSON.stringify({
      code: "ORDERPAID",
      message: "order already paid",
    }), 400), () => {
      didAbort = true;
    });
    const gateway = await createGateway(fetchImpl, 20);

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      code: "WECHAT_PAY_CLOSE_FAILED",
      details: {
        status: 400,
        code: "ORDERPAID",
        message: "order already paid",
      },
    });
    await Bun.sleep(30);

    expect(didAbort).toBe(false);
  });

  test("clears the timer after strict signature verification fails", async () => {
    let didAbort = false;
    const response = signedResponse("", 204);
    response.headers.set("wechatpay-signature", "invalid-signature");
    const fetchImpl = observedFetch(response, () => {
      didAbort = true;
    });
    const gateway = await createGateway(fetchImpl, 20);

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      code: "WECHAT_PAY_RESPONSE_SIGNATURE_INVALID",
    });
    await Bun.sleep(30);

    expect(didAbort).toBe(false);
  });

  test("preserves a non-timeout strict body-read transport error", async () => {
    let didAbort = false;
    const response = signedResponse("", 204);
    Object.defineProperty(response, "text", {
      value: async () => {
        throw new TypeError("response stream failed");
      },
    });
    const fetchImpl = observedFetch(response, () => {
      didAbort = true;
    });
    const gateway = await createGateway(fetchImpl, 20);

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      code: "WECHAT_PAY_TRANSPORT_FAILED",
    });
    await Bun.sleep(30);

    expect(didAbort).toBe(false);
  });
});

async function createGateway(fetchImpl: typeof fetch, timeoutMs: number) {
  const { WechatPayGateway } = await import("./wechat-pay-gateway");
  return new WechatPayGateway({
    fetchImpl,
    closeRequestTimeoutMs: timeoutMs,
    nonceFactory: () => "request-nonce",
    timestampFactory: () => RESPONSE_TIMESTAMP,
    nowSecondsFactory: () => Number(RESPONSE_TIMESTAMP),
  });
}

function closeTransaction(gateway: Awaited<ReturnType<typeof createGateway>>) {
  return gateway.closeTransactionByOutTradeNo({
    config,
    outTradeNo: "WX202607190001",
    secretBundle,
  });
}

function observedFetch(response: Response, onAbort: () => void): typeof fetch {
  return mock(async (_url: string | URL | Request, init?: RequestInit) => {
    requireSignal(init).addEventListener("abort", onAbort, { once: true });
    return response;
  }) as unknown as typeof fetch;
}

function requireSignal(init: RequestInit | undefined): AbortSignal {
  const signal = init?.signal;
  if (!signal) throw new Error("missing AbortSignal");
  return signal;
}

function signedResponse(rawBody: string, status: number): Response {
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${RESPONSE_TIMESTAMP}\n${RESPONSE_NONCE}\n${rawBody}\n`),
    privateKey,
  ).toString("base64");
  const response = new Response(status === 204 ? null : rawBody, {
    status,
    headers: {
      "content-type": "application/json",
      "request-id": "wechat-request-id",
      "wechatpay-timestamp": RESPONSE_TIMESTAMP,
      "wechatpay-nonce": RESPONSE_NONCE,
      "wechatpay-serial": PUBLIC_KEY_ID,
      "wechatpay-signature": signature,
    },
  });
  return response;
}
