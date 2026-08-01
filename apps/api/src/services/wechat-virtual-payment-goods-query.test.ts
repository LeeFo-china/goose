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

function createGateway(input: {
  fetchImpl?: WechatVirtualPaymentFetch;
  response?: () => Response;
} = {}) {
  const captured: CapturedRequest[] = [];
  const fetchImpl = input.fetchImpl ?? mock(async (
    request: string | URL | Request,
    init?: RequestInit,
  ) => {
    captured.push({ url: String(request), init });
    return (input.response ?? (() => Response.json({})))();
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

describe("WechatVirtualPaymentGateway goods task queries", () => {
  test("queries the latest upload and publish tasks with signed read-only requests", async () => {
    const responses = [uploadSuccess(), publishSuccess()];
    const captured: CapturedRequest[] = [];
    const { gateway } = createGateway({
      fetchImpl: mock(async (
        request: string | URL | Request,
        init?: RequestInit,
      ) => {
        captured.push({ url: String(request), init });
        return Response.json(responses.shift(), {
          headers: { "request-id": `goods-request-${captured.length}` },
        });
      }),
    });
    const input = {
      accessToken: ACCESS_TOKEN,
      environment: "production" as const,
      signingSecret: { environment: "production" as const, appKey: APP_KEY },
    };

    const upload = await gateway.queryUploadGoods(input);
    const publish = await gateway.queryPublishGoods(input);
    const body = JSON.stringify({ env: 0 });
    const uploadSig = calculateVirtualPaymentPaySig(
      "/xpay/query_upload_goods",
      body,
      APP_KEY,
    );
    const publishSig = calculateVirtualPaymentPaySig(
      "/xpay/query_publish_goods",
      body,
      APP_KEY,
    );

    expect(captured.map(({ url }) => url)).toEqual([
      `${BASE_URL}/xpay/query_upload_goods?access_token=access%2B%2Ftoken%3D&pay_sig=${uploadSig}`,
      `${BASE_URL}/xpay/query_publish_goods?access_token=access%2B%2Ftoken%3D&pay_sig=${publishSig}`,
    ]);
    expect(captured.map(({ init }) => init?.body)).toEqual([body, body]);
    expect(upload).toEqual({
      requestId: "goods-request-1",
      environment: "production",
      status: 3,
      items: [{
        id: "branding-annual",
        name: "年度品牌权益",
        price: 9_900,
        uploadStatus: 2,
      }],
    });
    expect(publish).toEqual({
      requestId: "goods-request-2",
      environment: "production",
      status: 3,
      items: [{ id: "branding-annual", publishStatus: 2 }],
    });
    expect(JSON.stringify([upload, publish])).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify([upload, publish])).not.toContain(APP_KEY);
  });

  test("normalizes an omitted goods list only when WeChat reports no latest task", async () => {
    const responses = [
      { errcode: 0, errmsg: "", status: 0 },
      { errcode: 0, errmsg: "", status: 0 },
    ];
    const { gateway } = createGateway({
      fetchImpl: mock(async () => Response.json(responses.shift())),
    });
    const input = {
      accessToken: ACCESS_TOKEN,
      environment: "sandbox" as const,
      signingSecret: { environment: "sandbox" as const, appKey: APP_KEY },
    };

    await expect(gateway.queryUploadGoods(input)).resolves.toMatchObject({
      status: 0,
      items: [],
    });
    await expect(gateway.queryPublishGoods(input)).resolves.toMatchObject({
      status: 0,
      items: [],
    });
  });

  test.each([
    ["upload task status", {
      errcode: 0,
      errmsg: "",
      status: 4,
      upload_item: [],
    }, "queryUploadGoods"],
    ["upload item schema", {
      ...uploadSuccess(),
      upload_item: [{
        ...uploadSuccess().upload_item[0],
        price: "9900",
      }],
    }, "queryUploadGoods"],
    ["publish item count", {
      errcode: 0,
      errmsg: "",
      status: 3,
      publish_item: Array.from({ length: 101 }, (_, index) => ({
        id: `goods-${index}`,
        publish_status: 2,
        errmsg: "",
      })),
    }, "queryPublishGoods"],
  ] as const)("rejects an invalid %s response with bounded safe metadata", async (
    _label,
    payload,
    method,
  ) => {
    const requestId = "goods-request-safe";
    const { gateway } = createGateway({
      response: () => Response.json(payload, {
        headers: { "request-id": requestId },
      }),
    });
    const input = {
      accessToken: ACCESS_TOKEN,
      environment: "production" as const,
      signingSecret: { environment: "production" as const, appKey: APP_KEY },
    };
    const request = method === "queryUploadGoods"
      ? gateway.queryUploadGoods(input)
      : gateway.queryPublishGoods(input);

    await expect(request).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_VIRTUAL_PAYMENT_RESPONSE_INVALID",
      details: { requestId },
    });
  });
});

function uploadSuccess() {
  return {
    errcode: 0,
    errmsg: "",
    status: 3,
    upload_item: [{
      id: "branding-annual",
      name: "年度品牌权益",
      price: 9_900,
      remark: "年度数字权益",
      item_url: "https://example.test/branding.png",
      upload_status: 2,
      errmsg: "",
    }],
  };
}

function publishSuccess() {
  return {
    errcode: 0,
    errmsg: "",
    status: 3,
    publish_item: [{
      id: "branding-annual",
      publish_status: 2,
      errmsg: "",
    }],
  };
}
