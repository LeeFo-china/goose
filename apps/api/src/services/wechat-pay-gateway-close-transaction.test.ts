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
  app_id: "wxbac3b1e168fd968a",
  sub_app_id: null,
  serial_no: "SERIALNO",
  notify_url: "https://api.example.com/pay/wechat/callback",
} satisfies WechatPayJsapiConfig;

const partnerConfig = {
  ...directConfig,
  merchant_mode: "service_provider_sub_merchant",
  merchant_id: "1561816121",
  sub_merchant_id: "1900000002",
  app_id: "wx-service-app",
  sub_app_id: "wxbac3b1e168fd968a",
} satisfies WechatPayJsapiConfig;

const secretBundle = {
  privateKeyPem: privateKey,
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPaySecretBundle;

async function createGateway(
  fetchImpl: typeof fetch,
  closeRequestTimeoutMs?: number,
) {
  const { WechatPayGateway } = await import("./wechat-pay-gateway");
  return new WechatPayGateway({
    fetchImpl,
    closeRequestTimeoutMs,
    nonceFactory: () => "nonce-1",
    timestampFactory: () => "1782873600",
  });
}

describe("WechatPayGateway closeTransactionByOutTradeNo", () => {
  test("closes an encoded direct merchant transaction with a signed body", async () => {
    const outTradeNo = "WX/2026?07";
    const urlPath = "/v3/pay/transactions/out-trade-no/WX%2F2026%3F07/close";
    const expectedBody = JSON.stringify({ mchid: "1112582521" });
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${secretBundle.baseUrl}${urlPath}`);
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(expectedBody);
      expectAuthorizationSignature(init, urlPath, expectedBody);
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await gateway.closeTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo,
      secretBundle,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("closes a service provider sub-merchant transaction", async () => {
    const urlPath = "/v3/pay/partner/transactions/out-trade-no/WX202607010001/close";
    const expectedBody = JSON.stringify({
      sp_mchid: "1561816121",
      sub_mchid: "1900000002",
    });
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${secretBundle.baseUrl}${urlPath}`);
      expect(init?.body).toBe(expectedBody);
      expectAuthorizationSignature(init, urlPath, expectedBody);
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await gateway.closeTransactionByOutTradeNo({
      config: partnerConfig,
      outTradeNo: "WX202607010001",
      secretBundle,
    });
  });

  test("maps close-order upstream failures to a stable business error", async () => {
    const fetchImpl = mock(async () => new Response(JSON.stringify({
      code: "ORDERPAID",
      message: "order already paid",
    }), { status: 400 })) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_CLOSE_FAILED",
      details: {
        status: 400,
        code: "ORDERPAID",
        message: "order already paid",
      },
    });
  });

  test("rejects an unexpected successful status instead of assuming closure", async () => {
    const fetchImpl = mock(async () => new Response(null, {
      status: 202,
    })) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_CLOSE_FAILED",
      details: { status: 202, code: null, message: null },
    });
  });

  test("maps non-JSON close-order failures without inventing fields", async () => {
    const fetchImpl = mock(async () => new Response("upstream unavailable", {
      status: 503,
      headers: { "content-type": "text/plain" },
    })) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_CLOSE_FAILED",
      details: { status: 503, code: null, message: null },
    });
  });

  test("rejects close-order requests with stable configuration errors", async () => {
    const fetchImpl = mock(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(closeTransaction(gateway, {
      config: { ...directConfig, serial_no: null },
    })).rejects.toMatchObject({ code: "WECHAT_PAY_SERIAL_NO_REQUIRED" });
    await expect(closeTransaction(gateway, {
      config: { ...partnerConfig, sub_merchant_id: null },
    })).rejects.toMatchObject({ code: "WECHAT_PAY_CONFIG_INCOMPLETE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("does not wrap signing failures as close transport failures", async () => {
    const fetchImpl = mock(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);
    let caughtError: unknown;

    try {
      await closeTransaction(gateway, {
        secretBundle: { ...secretBundle, privateKeyPem: "invalid-key" },
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect(caughtError).not.toMatchObject({ code: "WECHAT_PAY_CLOSE_FAILED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("aborts a timed-out close request and returns a stable error", async () => {
    let didAbort = false;
    const fetchImpl = mock((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const requestSignal = init?.signal;
        if (!requestSignal) {
          reject(new Error("missing AbortSignal"));
          return;
        }
        requestSignal.addEventListener("abort", () => {
          didAbort = true;
          reject(requestSignal.reason);
        }, { once: true });
      })) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl, 5);

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      statusCode: 502,
      message: "微信支付关单失败",
      code: "WECHAT_PAY_CLOSE_FAILED",
      details: { reason: "timeout", timeout_ms: 5 },
    });
    expect(didAbort).toBe(true);
  });

  test("maps close request network failures without leaking the cause", async () => {
    const fetchImpl = mock(async () => {
      throw new TypeError("connect ECONNRESET internal-upstream.example");
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      statusCode: 502,
      message: "微信支付关单失败",
      code: "WECHAT_PAY_CLOSE_FAILED",
      details: { reason: "network_error" },
    });
  });
});

async function closeTransaction(
  gateway: Awaited<ReturnType<typeof createGateway>>,
  overrides: Partial<Parameters<typeof gateway.closeTransactionByOutTradeNo>[0]> = {},
) {
  return gateway.closeTransactionByOutTradeNo({
    config: directConfig,
    outTradeNo: "WX202607010001",
    secretBundle,
    ...overrides,
  });
}

function expectAuthorizationSignature(
  init: RequestInit | undefined,
  urlPath: string,
  body: string,
) {
  const authorization = String(
    (init?.headers as Record<string, string>).Authorization,
  );
  const signature = authorization.match(/signature="([^"]+)"/)?.[1];
  expect(signature).toBeTruthy();
  const verifier = createVerify("RSA-SHA256");
  verifier.update(buildWechatPayRequestSignMessage({
    method: "POST",
    urlPath,
    body,
    nonce: "nonce-1",
    timestamp: "1782873600",
  }));
  verifier.end();
  expect(verifier.verify(publicKey, signature || "", "base64")).toBe(true);
}
