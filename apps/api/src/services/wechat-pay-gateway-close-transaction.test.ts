import { describe, expect, mock, test } from "bun:test";
import { createVerify, generateKeyPairSync, sign } from "node:crypto";
import type { WechatPayJsapiConfig } from "./wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";
import {
  buildWechatPayMiniProgramSignMessage,
  buildWechatPayRequestSignMessage,
} from "./wechat-pay-signatures";

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
  sub_merchant_id: "1900000109",
  app_id: "wx-service-app",
  sub_app_id: "wxbac3b1e168fd968a",
} satisfies WechatPayJsapiConfig;

const secretBundle = {
  privateKeyPem: privateKey,
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
  wechatPayPublicKeyPem: publicKey,
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPaySecretBundle;

const RESPONSE_TIMESTAMP = "1782873600";
const RESPONSE_NONCE = "response-nonce";

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
    nowSecondsFactory: () => 1_782_873_600,
  });
}

describe("WechatPayGateway close transaction and local payment request", () => {
  test("closes an encoded direct merchant transaction with a signed body", async () => {
    const outTradeNo = "WX/2026?07";
    const urlPath = "/v3/pay/transactions/out-trade-no/WX%2F2026%3F07/close";
    const expectedBody = JSON.stringify({ mchid: "1112582521" });
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${secretBundle.baseUrl}${urlPath}`);
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(expectedBody);
      expectAuthorizationSignature(init, urlPath, expectedBody);
      return signedCloseResponse("", 204);
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
      sub_mchid: "1900000109",
    });
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${secretBundle.baseUrl}${urlPath}`);
      expect(init?.body).toBe(expectedBody);
      expectAuthorizationSignature(init, urlPath, expectedBody);
      return signedCloseResponse("", 204);
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await gateway.closeTransactionByOutTradeNo({
      config: partnerConfig,
      outTradeNo: "WX202607010001",
      secretBundle,
    });
  });

  test("maps close-order upstream failures to a stable business error", async () => {
    const fetchImpl = mock(async () => signedCloseResponse(JSON.stringify({
      code: "ORDERPAID",
      message: "order already paid",
    }), 400)) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_CLOSE_FAILED",
      details: {
        status: 400,
        code: "ORDERPAID",
        message: "order already paid",
        requestId: "wechat-request-id",
      },
    });
  });

  test("rejects an unexpected successful status instead of assuming closure", async () => {
    const fetchImpl = mock(async () => signedCloseResponse("{}", 202)) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_CLOSE_FAILED",
      details: { status: 202, code: null, message: null },
    });
  });

  test("maps non-JSON close-order failures without inventing fields", async () => {
    const fetchImpl = mock(async () => signedCloseResponse(
      "upstream unavailable",
      503,
    )) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_CLOSE_FAILED",
      details: { status: 503, code: null, message: null },
    });
  });

  test("rejects close-order requests with stable configuration errors", async () => {
    const fetchImpl = mock(async () => signedCloseResponse("", 204)) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(closeTransaction(gateway, {
      config: { ...directConfig, serial_no: null },
    })).rejects.toMatchObject({ code: "WECHAT_PAY_SERIAL_NO_REQUIRED" });
    await expect(closeTransaction(gateway, {
      config: { ...partnerConfig, sub_merchant_id: null },
    })).rejects.toMatchObject({ code: "WECHAT_PAY_CONFIG_INCOMPLETE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("re-signs a mini program payment request locally with sub app id", async () => {
    const fetchImpl = mock(async () => {
      throw new Error("unexpected HTTP request");
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    const paymentRequest = gateway.createMiniProgramPaymentRequest({
      config: partnerConfig,
      prepayId: "prepay-test",
      secretBundle,
    });

    expect(paymentRequest).toMatchObject({
      timeStamp: "1782873600",
      nonceStr: "nonce-1",
      package: "prepay_id=prepay-test",
      signType: "RSA",
    });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(buildWechatPayMiniProgramSignMessage({
      appId: partnerConfig.sub_app_id,
      timestamp: paymentRequest.timeStamp,
      nonce: paymentRequest.nonceStr,
      packageValue: paymentRequest.package,
    }));
    verifier.end();
    expect(verifier.verify(publicKey, paymentRequest.paySign, "base64")).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("rejects local re-signing when the mini program app id is missing", async () => {
    const gateway = await createGateway(fetch);

    expect(() => gateway.createMiniProgramPaymentRequest({
      config: { ...directConfig, app_id: null, sub_app_id: null },
      prepayId: "prepay-test",
      secretBundle,
    })).toThrow(expect.objectContaining({
      statusCode: 409,
      code: "WECHAT_PAY_CONFIG_INCOMPLETE",
    }));
  });

  test("re-signs locally with the direct merchant app id fallback", async () => {
    const gateway = await createGateway(fetch);

    const paymentRequest = gateway.createMiniProgramPaymentRequest({
      config: directConfig,
      prepayId: "prepay-direct",
      secretBundle,
    });

    const verifier = createVerify("RSA-SHA256");
    verifier.update(buildWechatPayMiniProgramSignMessage({
      appId: directConfig.app_id,
      timestamp: paymentRequest.timeStamp,
      nonce: paymentRequest.nonceStr,
      packageValue: paymentRequest.package,
    }));
    verifier.end();
    expect(verifier.verify(publicKey, paymentRequest.paySign, "base64")).toBe(true);
  });

  test("does not wrap signing failures as close transport failures", async () => {
    const fetchImpl = mock(async () => signedCloseResponse("", 204)) as unknown as typeof fetch;
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

  test.each([
    "wechatpay-timestamp",
    "wechatpay-nonce",
    "wechatpay-serial",
    "wechatpay-signature",
  ])("rejects a 204 response missing %s", async (header) => {
    const response = signedCloseResponse("", 204);
    response.headers.delete(header);
    const gateway = await createGateway(
      mock(async () => response) as unknown as typeof fetch,
    );

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      code: "WECHAT_PAY_RESPONSE_SIGNATURE_REQUIRED",
    });
  });

  test("rejects a 204 response with a wrong signature", async () => {
    const response = signedCloseResponse("", 204, {
      signature: "WECHATPAY/SIGNTEST/invalid",
    });
    const gateway = await createGateway(
      mock(async () => response) as unknown as typeof fetch,
    );

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      code: "WECHAT_PAY_RESPONSE_SIGNATURE_INVALID",
    });
  });

  test("rejects a 204 response signed by an unexpected key id", async () => {
    const response = signedCloseResponse("", 204, { serial: "OTHER_KEY" });
    const gateway = await createGateway(
      mock(async () => response) as unknown as typeof fetch,
    );

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      code: "WECHAT_PAY_RESPONSE_SERIAL_MISMATCH",
    });
  });

  test("rejects a stale signed 204 response", async () => {
    const response = signedCloseResponse("", 204, {
      timestamp: String(Number(RESPONSE_TIMESTAMP) - 301),
    });
    const gateway = await createGateway(
      mock(async () => response) as unknown as typeof fetch,
    );

    await expect(closeTransaction(gateway)).rejects.toMatchObject({
      code: "WECHAT_PAY_RESPONSE_TIMESTAMP_INVALID",
    });
  });

  test.each(["{}", "not-json"])(
    "rejects a signed 204 response with nonempty body %s",
    async (rawBody) => {
      const response = signedCloseResponse(rawBody, 204);
      const gateway = await createGateway(
        mock(async () => response) as unknown as typeof fetch,
      );

      await expect(closeTransaction(gateway)).rejects.toMatchObject({
        code: "WECHAT_PAY_RESPONSE_BODY_INVALID",
      });
    },
  );

  test("does not trust an unsigned non-204 error payload", async () => {
    const rawBody = JSON.stringify({
      code: "ORDERPAID",
      message: "untrusted-upstream-message",
    });
    const response = new Response(rawBody, { status: 400 });
    const gateway = await createGateway(
      mock(async () => response) as unknown as typeof fetch,
    );
    let caught: unknown;

    try {
      await closeTransaction(gateway);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "WECHAT_PAY_RESPONSE_SIGNATURE_REQUIRED",
    });
    expect(JSON.stringify(caught)).not.toContain("untrusted-upstream-message");
  });

  test("does not trust a tampered non-204 error payload", async () => {
    const response = signedCloseResponse(JSON.stringify({
      code: "ORDERPAID",
      message: "signed-message",
    }), 400);
    Object.defineProperty(response, "text", {
      value: async () => JSON.stringify({
        code: "ORDERPAID",
        message: "tampered-upstream-message",
      }),
    });
    const gateway = await createGateway(
      mock(async () => response) as unknown as typeof fetch,
    );
    let caught: unknown;

    try {
      await closeTransaction(gateway);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "WECHAT_PAY_RESPONSE_SIGNATURE_INVALID",
    });
    expect(JSON.stringify(caught)).not.toContain("tampered-upstream-message");
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

function signedCloseResponse(
  rawBody: string,
  status: number,
  overrides: {
    timestamp?: string;
    serial?: string;
    signature?: string;
  } = {},
) {
  const timestamp = overrides.timestamp ?? RESPONSE_TIMESTAMP;
  const signature = overrides.signature ?? sign(
    "RSA-SHA256",
    Buffer.from(`${timestamp}\n${RESPONSE_NONCE}\n${rawBody}\n`),
    privateKey,
  ).toString("base64");
  const response = new Response(status === 204 ? null : rawBody, {
    status,
    headers: {
      "content-type": "application/json",
      "request-id": "wechat-request-id",
      "wechatpay-timestamp": timestamp,
      "wechatpay-nonce": RESPONSE_NONCE,
      "wechatpay-serial": overrides.serial ?? "PUB_KEY_ID_TEST",
      "wechatpay-signature": signature,
    },
  });
  if (status === 204 && rawBody) {
    Object.defineProperty(response, "text", { value: async () => rawBody });
  }
  return response;
}
