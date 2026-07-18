import { describe, expect, mock, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import type { WechatPayJsapiConfig } from "./wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { privateKey } = generateKeyPairSync("rsa", {
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
  notify_url: "https://api.example.com/pay/wechat/callback",
} satisfies WechatPayJsapiConfig;

const secretBundle = {
  privateKeyPem: privateKey,
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPaySecretBundle;

describe("WechatPayGateway JSAPI prepay transport", () => {
  test("normalizes the prepay timeout to 1 millisecond through 60 seconds", async () => {
    const gatewayModule = await import("./wechat-pay-gateway");
    const normalize = (gatewayModule as unknown as {
      normalizeWechatPayPrepayRequestTimeout?: (value?: number) => number;
    }).normalizeWechatPayPrepayRequestTimeout;

    expect(typeof normalize).toBe("function");
    if (!normalize) return;
    expect(normalize(undefined)).toBe(10_000);
    expect(normalize(-1)).toBe(1);
    expect(normalize(60_001)).toBe(60_000);
  });

  test("aborts a timed-out prepay request with a stable diagnostic", async () => {
    let didAbort = false;
    const fetchImpl = mock((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing AbortSignal"));
          return;
        }
        signal.addEventListener("abort", () => {
          didAbort = true;
          reject(signal.reason);
        }, { once: true });
      })) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl, 5);

    await expect(createPrepay(gateway)).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_PREPAY_FAILED",
      details: { reason: "timeout", timeout_ms: 5 },
    });
    expect(didAbort).toBe(true);
  });

  test("maps network rejection without leaking its cause", async () => {
    const fetchImpl = mock(async () => {
      throw new TypeError("connect ECONNRESET internal-prepay.example");
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    let error: unknown;
    try {
      await createPrepay(gateway);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_PREPAY_FAILED",
      details: { reason: "network_error" },
    });
    expect(JSON.stringify(error)).not.toContain("internal-prepay.example");
  });
});

async function createGateway(fetchImpl: typeof fetch, timeoutMs?: number) {
  const { WechatPayGateway } = await import("./wechat-pay-gateway");
  return new WechatPayGateway({
    fetchImpl,
    prepayRequestTimeoutMs: timeoutMs,
    nonceFactory: () => "nonce-1",
    timestampFactory: () => "1782873600",
  } as ConstructorParameters<typeof WechatPayGateway>[0] & {
    prepayRequestTimeoutMs?: number;
  });
}

function createPrepay(gateway: Awaited<ReturnType<typeof createGateway>>) {
  return gateway.createJsapiPrepay({
    config,
    order: {
      out_trade_no: "WX202607180001",
      amount: 100,
      payer_openid: "openid-1",
      payment_expires_at: "2026-07-18T02:05:00.000Z",
    },
    description: "积分充值",
    secretBundle,
  });
}
