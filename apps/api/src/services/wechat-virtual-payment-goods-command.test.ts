import { describe, expect, mock, test } from "bun:test";

import { wechatMiniSessionCredentialService } from
  "@/services/wechat-mini-session-credentials";
import type { WechatVirtualPaymentFetch } from
  "@/services/wechat-virtual-payment-gateway-contracts";
import { WechatVirtualPaymentGateway } from
  "@/services/wechat-virtual-payment-gateway";
import { calculateVirtualPaymentPaySig } from
  "@/services/wechat-virtual-payment-signatures";

const BASE_URL = "https://xpay.test";
const ACCESS_TOKEN = "access+/token=";
const APP_KEY = "production-app-key";

type CapturedRequest = { url: string; init: RequestInit | undefined };

function createGateway() {
  const captured: CapturedRequest[] = [];
  const fetchImpl: WechatVirtualPaymentFetch = mock(async (
    request: string | URL | Request,
    init?: RequestInit,
  ) => {
    captured.push({ url: String(request), init });
    return Response.json({ errcode: 0, errmsg: "" }, {
      headers: { "request-id": `goods-command-${captured.length}` },
    });
  });
  return {
    gateway: new WechatVirtualPaymentGateway({
      fetchImpl,
      baseUrl: BASE_URL,
      credentialInvalidation: wechatMiniSessionCredentialService,
    }),
    captured,
  };
}

const signedInput = {
  accessToken: ACCESS_TOKEN,
  environment: "production" as const,
  signingSecret: { environment: "production" as const, appKey: APP_KEY },
};

describe("WechatVirtualPaymentGateway goods commands", () => {
  test("starts one image-aware upload task with the exact signed body", async () => {
    const { gateway, captured } = createGateway();
    const body = JSON.stringify({
      upload_item: [{
        id: "branding-annual",
        name: "年度品牌权益",
        price: 9_900,
        remark: "年度数字权益",
        item_url: "https://cdn.example.test/branding.png",
      }],
      env: 0,
    });

    await expect(gateway.startUploadGoods({
      ...signedInput,
      item: {
        id: "branding-annual",
        name: "年度品牌权益",
        price: 9_900,
        remark: "年度数字权益",
        itemUrl: "https://cdn.example.test/branding.png",
      },
    })).resolves.toEqual({
      accepted: true,
      environment: "production",
      requestId: "goods-command-1",
    });

    const paySig = calculateVirtualPaymentPaySig(
      "/xpay/start_upload_goods",
      body,
      APP_KEY,
    );
    expect(captured).toEqual([{
      url: `${BASE_URL}/xpay/start_upload_goods?access_token=access%2B%2Ftoken%3D&pay_sig=${paySig}`,
      init: expect.objectContaining({ method: "POST", body }),
    }]);
    expect(JSON.stringify(captured)).not.toContain(APP_KEY);
  });

  test("starts one publish task with the exact signed body", async () => {
    const { gateway, captured } = createGateway();
    const body = JSON.stringify({
      publish_item: [{ id: "branding-annual" }],
      env: 0,
    });

    await expect(gateway.startPublishGoods({
      ...signedInput,
      providerProductId: "branding-annual",
    })).resolves.toEqual({
      accepted: true,
      environment: "production",
      requestId: "goods-command-1",
    });

    const paySig = calculateVirtualPaymentPaySig(
      "/xpay/start_publish_goods",
      body,
      APP_KEY,
    );
    expect(captured).toEqual([{
      url: `${BASE_URL}/xpay/start_publish_goods?access_token=access%2B%2Ftoken%3D&pay_sig=${paySig}`,
      init: expect.objectContaining({ method: "POST", body }),
    }]);
    expect(JSON.stringify(captured)).not.toContain(APP_KEY);
  });

  test("rejects image fragments that the database URL contract cannot persist", async () => {
    const { gateway, captured } = createGateway();

    await expect(gateway.startUploadGoods({
      ...signedInput,
      item: {
        id: "branding-annual",
        name: "年度品牌权益",
        price: 9_900,
        remark: "年度数字权益",
        itemUrl: "https://cdn.example.test/branding.png#unstable",
      },
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "WECHAT_VIRTUAL_PAYMENT_REQUEST_INVALID",
    });
    expect(captured).toHaveLength(0);
  });
});
