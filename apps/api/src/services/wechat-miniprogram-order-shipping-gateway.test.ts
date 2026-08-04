import { describe, expect, mock, test } from "bun:test";
import type {
  WechatOrderShippingPayload,
} from "@/services/wechat-miniprogram-order-shipping-gateway";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const payload: WechatOrderShippingPayload = {
  order_key: {
    order_number_type: 2,
    transaction_id: "4200000000202608040000000001",
  },
  logistics_type: 3,
  delivery_mode: 1,
  shipping_list: [{
    item_desc: "客户专属系统环境已部署，服务器配置及首次操作培训已完成",
  }],
  upload_time: "2026-08-04T06:30:00.000Z",
  payer: {
    openid: "openid-tenant-employee",
  },
};

describe("WechatMiniProgramOrderShippingGateway", () => {
  test("uploads no-physical-delivery shipping info through the WeChat server API", async () => {
    const { WechatMiniProgramOrderShippingGateway } = await import(
      "./wechat-miniprogram-order-shipping-gateway"
    );
    const getAccessToken = mock(async () => "access-token");
    const requestedUrls: URL[] = [];
    const fetchImpl = mock(async (input: string | URL | Request) => {
      requestedUrls.push(input instanceof URL ? input : new URL(String(input)));
      return new Response(JSON.stringify({
      errcode: 0,
      errmsg: "ok",
      }), { status: 200 });
    });
    const gateway = new WechatMiniProgramOrderShippingGateway({
      accessTokenProvider: { getAccessToken },
      fetchImpl,
    });

    await expect(gateway.uploadShippingInfo(payload)).resolves.toEqual({
      wechat_errcode: 0,
      wechat_errmsg: "ok",
    });
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: expect.any(AbortSignal),
      }),
    );
    const requestedUrl = requestedUrls[0];
    expect(requestedUrl).toBeDefined();
    expect(requestedUrl?.href).toStartWith(
      "https://api.weixin.qq.com/wxa/sec/order/upload_shipping_info",
    );
    expect(requestedUrl?.searchParams.get("access_token")).toBe("access-token");
  });

  test("wraps WeChat rejection without exposing provider diagnostics or tokens", async () => {
    const { WechatMiniProgramOrderShippingGateway } = await import(
      "./wechat-miniprogram-order-shipping-gateway"
    );
    const gateway = new WechatMiniProgramOrderShippingGateway({
      accessTokenProvider: { getAccessToken: mock(async () => "secret-token") },
      fetchImpl: mock(async () => new Response(JSON.stringify({
        errcode: 10060004,
        errmsg: "private provider diagnostic secret-token",
      }), { status: 200 })),
    });

    try {
      await gateway.uploadShippingInfo(payload);
      throw new TypeError("expected rejection");
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 502,
        code: "WECHAT_ORDER_SHIPPING_UPLOAD_REJECTED",
        details: { httpStatus: 200, wechatErrcode: 10060004 },
      });
      expect(String(error)).not.toContain("private provider diagnostic");
      expect(String(error)).not.toContain("secret-token");
    }
  });
});
