import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("WechatVirtualPaymentController routes", () => {
  test("registers separate bounded GET and POST message endpoints", async () => {
    const { WechatVirtualPaymentController } = await import(".");
    const controller = new WechatVirtualPaymentController({
      verifyEndpoint: mock(async () => "echo"),
      handle: mock(async () => ({
        kind: "ack" as const,
        httpStatus: 200,
        format: "json" as const,
        body: { ErrCode: 0 as const, ErrMsg: "success" as const },
      })),
    });
    const routes: Array<{
      method: "GET" | "POST";
      path: string;
      options?: Record<string, unknown>;
    }> = [];
    const fastify = {
      addContentTypeParser: mock(() => undefined),
      get: (path: string, handler: unknown) => routes.push({
        method: "GET",
        path,
        options: { handler },
      }),
      post: (path: string, options: Record<string, unknown>) => routes.push({
        method: "POST",
        path,
        options,
      }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({
      method: "GET",
      path: "/wechat/virtual-payment/events",
    });
    expect(routes[1]).toMatchObject({
      method: "POST",
      path: "/wechat/virtual-payment/events",
      options: expect.objectContaining({
        bodyLimit: 65_536,
        preParsing: expect.any(Function),
      }),
    });
  });

  test("sends an XML acknowledgement for an XML notification", async () => {
    const { WechatVirtualPaymentController } = await import(".");
    const controller = new WechatVirtualPaymentController({
      verifyEndpoint: mock(async () => "echo"),
      handle: mock(async () => ({
        kind: "ack" as const,
        httpStatus: 200,
        format: "xml" as const,
        body: { ErrCode: 0 as const, ErrMsg: "success" as const },
      })),
    });
    const type = mock(() => reply);
    const status = mock(() => reply);
    const send = mock(() => undefined);
    const reply = { type, status, send };

    await controller.handleEvent({
      rawBody: "<xml></xml>",
      headers: { "content-type": "application/xml" },
      query: {},
      id: "request-1",
      log: { warn: mock(() => undefined) },
    } as never, reply as never);

    expect(type).toHaveBeenCalledWith("application/xml; charset=utf-8");
    expect(send).toHaveBeenCalledWith(
      "<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>",
    );
  });

  test("escapes every untrusted iOS inquiry XML response field", async () => {
    const { WechatVirtualPaymentController } = await import(".");
    const controller = new WechatVirtualPaymentController({
      verifyEndpoint: mock(async () => "echo"),
      handle: mock(async () => ({
        kind: "ios_refund_inquiry" as const,
        httpStatus: 200 as const,
        format: "xml" as const,
        body: {
          result_code: 1 as const,
          result_info: "复核<&>\"'",
          evidence: "证据<&>\"'",
        },
      })),
    });
    const type = mock(() => reply);
    const status = mock(() => reply);
    const send = mock(() => undefined);
    const reply = { type, status, send };

    await controller.handleEvent({
      rawBody: "<xml></xml>",
      headers: { "content-type": "application/xml" },
      query: {}, id: "request-inquiry",
      log: { warn: mock(() => undefined) },
    } as never, reply as never);

    expect(send).toHaveBeenCalledWith(
      "<xml><result_code>1</result_code>" +
      "<result_info>复核&lt;&amp;&gt;&quot;&apos;</result_info>" +
      "<evidence>证据&lt;&amp;&gt;&quot;&apos;</evidence></xml>",
    );
  });
});
