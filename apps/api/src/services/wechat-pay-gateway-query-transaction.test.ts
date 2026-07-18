import { describe, expect, mock, test } from "bun:test";
import { createVerify, generateKeyPairSync } from "node:crypto";
import type { WechatPayJsapiConfig } from "./wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";
import { buildWechatPayRequestSignMessage } from "./wechat-pay-signatures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

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
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPaySecretBundle;

describe("queryWechatPayTransactionByOutTradeNo", () => {
  test("queries and signs an encoded direct merchant transaction", async () => {
    const path = "/v3/pay/transactions/out-trade-no/WX%2F2026%3F07?mchid=1112582521";
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${secretBundle.baseUrl}${path}`);
      expect(init?.method).toBe("GET");
      expectSignature(init, path);
      return jsonResponse({ trade_state: "NOTPAY" });
    }) as unknown as typeof fetch;
    const { queryWechatPayTransactionByOutTradeNo } = await import(
      "./wechat-pay-gateway-query-transaction"
    );

    const result = await queryWechatPayTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX/2026?07",
      secretBundle,
      fetchImpl,
      nonce: "nonce-1",
      timestamp: "1782873600",
    });

    expect(result.trade_state).toBe("NOTPAY");
  });

  test("queries a service provider sub-merchant transaction", async () => {
    const path = "/v3/pay/partner/transactions/out-trade-no/WX1?sp_mchid=1561816121&sub_mchid=1900000002";
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${secretBundle.baseUrl}${path}`);
      expectSignature(init, path);
      return jsonResponse({ trade_state: "SUCCESS" });
    }) as unknown as typeof fetch;
    const { queryWechatPayTransactionByOutTradeNo } = await import(
      "./wechat-pay-gateway-query-transaction"
    );

    await queryWechatPayTransactionByOutTradeNo({
      config: partnerConfig,
      outTradeNo: "WX1",
      secretBundle,
      fetchImpl,
      nonce: "nonce-1",
      timestamp: "1782873600",
    });
  });

  test("aborts a timed-out query with a stable diagnostic", async () => {
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
    const { queryWechatPayTransactionByOutTradeNo } = await import(
      "./wechat-pay-gateway-query-transaction"
    );

    await expect(queryWechatPayTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX1",
      secretBundle,
      fetchImpl,
      timeoutMs: 5,
    })).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_TRANSACTION_QUERY_FAILED",
      details: { reason: "timeout", timeout_ms: 5 },
    });
    expect(didAbort).toBe(true);
  });

  test("maps network rejection without leaking its cause", async () => {
    const fetchImpl = mock(async () => {
      throw new TypeError("connect ECONNRESET internal.example");
    }) as unknown as typeof fetch;
    const { queryWechatPayTransactionByOutTradeNo } = await import(
      "./wechat-pay-gateway-query-transaction"
    );

    await expect(queryWechatPayTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX1",
      secretBundle,
      fetchImpl,
    })).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_TRANSACTION_QUERY_FAILED",
      details: { reason: "network_error" },
    });
  });

  test("preserves upstream status, code and message", async () => {
    const fetchImpl = mock(async () => jsonResponse({
      code: "PARAM_ERROR",
      message: "invalid mchid",
    }, 400)) as unknown as typeof fetch;
    const { queryWechatPayTransactionByOutTradeNo } = await import(
      "./wechat-pay-gateway-query-transaction"
    );

    await expect(queryWechatPayTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX1",
      secretBundle,
      fetchImpl,
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_TRANSACTION_QUERY_FAILED",
      details: { status: 400, code: "PARAM_ERROR", message: "invalid mchid" },
    });
  });

  test("does not wrap configuration or signing errors as transport failures", async () => {
    const fetchImpl = mock(async () => jsonResponse({ trade_state: "NOTPAY" })) as unknown as typeof fetch;
    const { queryWechatPayTransactionByOutTradeNo } = await import(
      "./wechat-pay-gateway-query-transaction"
    );
    const run = (config: WechatPayJsapiConfig, bundle = secretBundle) =>
      queryWechatPayTransactionByOutTradeNo({
        config,
        outTradeNo: "WX1",
        secretBundle: bundle,
        fetchImpl,
      });

    await expect(run({ ...directConfig, serial_no: null })).rejects
      .toMatchObject({ code: "WECHAT_PAY_SERIAL_NO_REQUIRED" });
    await expect(run({ ...partnerConfig, sub_merchant_id: null })).rejects
      .toMatchObject({ code: "WECHAT_PAY_CONFIG_INCOMPLETE" });
    await expect(run(directConfig, {
      ...secretBundle,
      privateKeyPem: "invalid-private-key",
    })).rejects.not.toMatchObject({ code: "WECHAT_PAY_TRANSACTION_QUERY_FAILED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
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
    timestamp: "1782873600",
  }));
  verifier.end();
  expect(verifier.verify(publicKey, signature || "", "base64")).toBe(true);
}
