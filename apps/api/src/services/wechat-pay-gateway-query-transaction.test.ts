import { describe, expect, mock, test } from "bun:test";
import { createVerify, generateKeyPairSync, sign } from "node:crypto";
import type { WechatPayJsapiConfig } from "./wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";
import { buildWechatPayRequestSignMessage } from "./wechat-pay-signatures";

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
const directConfig = {
  merchant_mode: "direct_merchant",
  merchant_id: "1112582521",
  sub_merchant_id: null,
  app_id: "wx-app",
  sub_app_id: null,
  serial_no: "SERIALNO",
  notify_url: null,
} satisfies WechatPayJsapiConfig;
const partnerConfig = {
  ...directConfig,
  merchant_mode: "service_provider_sub_merchant",
  merchant_id: "1561816121",
  sub_merchant_id: "1900000002",
} satisfies WechatPayJsapiConfig;
const secretBundle = {
  privateKeyPem: privateKey,
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: PUBLIC_KEY_ID,
  wechatPayPublicKeyPem: publicKey,
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPaySecretBundle;

describe("WechatPayGateway query transaction", () => {
  test("normalizes query timeout to the supported 1 to 60 second range", async () => {
    const { normalizeWechatPayQueryRequestTimeout } = await import(
      "./wechat-pay-gateway-query-transaction"
    );

    expect(normalizeWechatPayQueryRequestTimeout(undefined)).toBe(10_000);
    expect(normalizeWechatPayQueryRequestTimeout(999)).toBe(1_000);
    expect(normalizeWechatPayQueryRequestTimeout(60_001)).toBe(60_000);
  });

  test("queries and signs an encoded direct merchant transaction", async () => {
    const path = "/v3/pay/transactions/out-trade-no/WX%2F2026%3F07?mchid=1112582521";
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${secretBundle.baseUrl}${path}`);
      expect(init?.method).toBe("GET");
      expectSignature(init, path);
      return signedJsonResponse({
        appid: directConfig.app_id,
        trade_state: "NOTPAY",
      });
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    const result = await gateway.queryTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX/2026?07",
      secretBundle,
    });

    expect(result.trade_state).toBe("NOTPAY");
    expect(result.appid).toBe(directConfig.app_id);
  });

  test("queries a service provider sub-merchant transaction", async () => {
    const path = "/v3/pay/partner/transactions/out-trade-no/WX1?sp_mchid=1561816121&sub_mchid=1900000002";
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${secretBundle.baseUrl}${path}`);
      expectSignature(init, path);
      return signedJsonResponse({ trade_state: "SUCCESS" });
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await gateway.queryTransactionByOutTradeNo({
      config: partnerConfig,
      outTradeNo: "WX1",
      secretBundle,
    });
  });

  test("aborts a timed-out query with the source timeout contract", async () => {
    let didAbort = false;
    const fetchImpl = mock((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return reject(new Error("missing AbortSignal"));
        signal.addEventListener("abort", () => {
          didAbort = true;
          reject(signal.reason);
        }, { once: true });
      })) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl, 5);

    await expect(gateway.queryTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX1",
      secretBundle,
    })).rejects.toMatchObject({
      statusCode: 504,
      code: "WECHAT_PAY_TRANSPORT_TIMEOUT",
      details: {
        operation: "transaction_query",
        requestId: null,
        reason: "timeout",
        timeout_ms: 1_000,
      },
    });
    expect(didAbort).toBe(true);
  });

  test("maps network rejection without leaking its cause", async () => {
    const fetchImpl = mock(async () => {
      throw new TypeError("connect ECONNRESET internal.example");
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    const request = gateway.queryTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX1",
      secretBundle,
    });
    await expect(request).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_TRANSPORT_FAILED",
      details: {
        operation: "transaction_query",
        requestId: null,
        reason: "network_error",
      },
    });
    await expect(request).rejects.not.toThrow("internal.example");
  });

  test("preserves verified upstream status, code and message", async () => {
    const fetchImpl = mock(async () => signedJsonResponse({
      code: "PARAM_ERROR",
      message: "invalid mchid",
    }, 400)) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(gateway.queryTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX1",
      secretBundle,
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_TRANSACTION_QUERY_FAILED",
      details: {
        operation: "transaction_query",
        requestId: "wechat-request-id",
        status: 400,
        code: "PARAM_ERROR",
        message: "invalid mchid",
      },
    });
  });

  test("does not trust an unsigned upstream error", async () => {
    const fetchImpl = mock(async () => new Response(JSON.stringify({
      code: "PARAM_ERROR",
      message: "untrusted message",
    }), { status: 400 })) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(gateway.queryTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX1",
      secretBundle,
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_RESPONSE_SIGNATURE_REQUIRED",
    });
  });

  test("does not wrap configuration or signing errors as transport failures", async () => {
    const fetchImpl = mock(async () => signedJsonResponse({
      trade_state: "NOTPAY",
    })) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);
    const run = (config: WechatPayJsapiConfig, bundle = secretBundle) =>
      gateway.queryTransactionByOutTradeNo({
        config,
        outTradeNo: "WX1",
        secretBundle: bundle,
      });

    await expect(run({ ...directConfig, serial_no: null })).rejects
      .toMatchObject({ code: "WECHAT_PAY_SERIAL_NO_REQUIRED" });
    await expect(run({ ...partnerConfig, sub_merchant_id: null })).rejects
      .toMatchObject({ code: "WECHAT_PAY_CONFIG_INCOMPLETE" });
    await expect(run(directConfig, {
      ...secretBundle,
      privateKeyPem: "invalid-private-key",
    })).rejects.not.toMatchObject({ code: "WECHAT_PAY_TRANSPORT_FAILED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

async function createGateway(fetchImpl: typeof fetch, timeoutMs?: number) {
  const { WechatPayGateway } = await import("./wechat-pay-gateway");
  return new WechatPayGateway({
    fetchImpl,
    nonceFactory: () => "nonce-1",
    timestampFactory: () => RESPONSE_TIMESTAMP,
    nowSecondsFactory: () => Number(RESPONSE_TIMESTAMP),
    queryRequestTimeoutMs: timeoutMs,
  });
}

function signedJsonResponse(body: Record<string, unknown>, status = 200) {
  const rawBody = JSON.stringify(body);
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${RESPONSE_TIMESTAMP}\n${RESPONSE_NONCE}\n${rawBody}\n`),
    privateKey,
  ).toString("base64");
  return new Response(rawBody, {
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
}

function expectSignature(init: RequestInit | undefined, urlPath: string) {
  const authorization = String(
    (init?.headers as Record<string, string>).Authorization,
  );
  const signature = authorization.match(/signature="([^"]+)"/)?.[1];
  expect(signature).toBeTruthy();
  const verifier = createVerify("RSA-SHA256");
  verifier.update(buildWechatPayRequestSignMessage({
    method: "GET",
    urlPath,
    body: "",
    nonce: "nonce-1",
    timestamp: RESPONSE_TIMESTAMP,
  }));
  verifier.end();
  expect(verifier.verify(publicKey, signature || "", "base64")).toBe(true);
}
