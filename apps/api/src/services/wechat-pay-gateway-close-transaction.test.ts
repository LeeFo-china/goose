import { describe, expect, mock, test } from "bun:test";
import { createVerify, generateKeyPairSync } from "node:crypto";
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

async function createGateway(fetchImpl: typeof fetch) {
  const { WechatPayGateway } = await import("./wechat-pay-gateway");
  return new WechatPayGateway({
    fetchImpl,
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
      sub_mchid: "1900000109",
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

    await expect(gateway.closeTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX202607010001",
      secretBundle,
    })).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_CLOSE_FAILED",
      details: {
        status: 400,
        code: "ORDERPAID",
        message: "order already paid",
      },
    });
  });

  test("rejects close-order requests with stable configuration errors", async () => {
    const fetchImpl = mock(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(gateway.closeTransactionByOutTradeNo({
      config: { ...directConfig, serial_no: null },
      outTradeNo: "WX202607010001",
      secretBundle,
    })).rejects.toMatchObject({ code: "WECHAT_PAY_SERIAL_NO_REQUIRED" });
    await expect(gateway.closeTransactionByOutTradeNo({
      config: { ...partnerConfig, sub_merchant_id: null },
      outTradeNo: "WX202607010001",
      secretBundle,
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
});

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
