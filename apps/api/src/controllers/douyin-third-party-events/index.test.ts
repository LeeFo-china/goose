import { describe, expect, mock, test } from "bun:test";
import Fastify from "fastify";
import { Errors } from "@/errors/error-factory";
import errorHandler from "@/plugins/error-handler";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const VALID_WRAPPER = {
  Nonce: "nonce-1",
  TimeStamp: "1784534400",
  Encrypt: "encrypted-message",
  MsgSignature: "a".repeat(40),
};

type RouteHandler = (
  request: { body?: unknown; log?: { info: (...args: unknown[]) => void } },
  reply: ReturnType<typeof createReply>["reply"],
) => Promise<unknown>;

async function createRoutes(
  service: {
    handleCallback: (
      wrapper: typeof VALID_WRAPPER,
      log?: { info: (metadata: { eventName: string }, message: string) => void },
    ) => Promise<void>;
  },
) {
  const { DouyinThirdPartyEventsController } = await import(".");
  const routes: Array<{ path: string; handler: RouteHandler }> = [];
  const controller = new DouyinThirdPartyEventsController(() => service);
  const fastify = {
    post: (path: string, handler: RouteHandler) => routes.push({ path, handler }),
  };
  controller.registerExtraRoutes(fastify as never);
  return routes;
}

function createReply() {
  const response: {
    statusCode?: number;
    contentType?: string;
    body?: unknown;
  } = {};
  const reply = {
    status(statusCode: number) {
      response.statusCode = statusCode;
      return reply;
    },
    type(contentType: string) {
      response.contentType = contentType;
      return reply;
    },
    send(body: unknown) {
      response.body = body;
      return body;
    },
  };
  return { reply, response };
}

describe("DouyinThirdPartyEventsController", () => {
  test("is attached to the root route registry", async () => {
    const routesSource = await Bun.file(
      new URL("../../routes/index.ts", import.meta.url),
    ).text();

    expect(routesSource).toContain(
      'import DouyinThirdPartyEventsController from "@/controllers/douyin-third-party-events";',
    );
    expect(routesSource).toContain(
      "DouyinThirdPartyEventsController.registerExtraRoutes(app);",
    );
  });

  test("registers only the two third-party callback POST routes", async () => {
    const routes = await createRoutes({ handleCallback: mock(async () => undefined) });

    expect(routes.map(({ path }) => path)).toEqual([
      "/douyin-thirdparty/events/authorization",
      "/douyin-thirdparty/events/message",
    ]);
  });

  test("valid callbacks return the exact platform acknowledgement", async () => {
    const handleCallback = mock(async () => undefined);
    const routes = await createRoutes({ handleCallback });

    for (const route of routes) {
      const { reply, response } = createReply();
      await route.handler({ body: VALID_WRAPPER }, reply);

      expect(response).toEqual({
        statusCode: 200,
        contentType: "text/plain",
        body: "success",
      });
    }
    expect(handleCallback).toHaveBeenCalledTimes(2);
    expect(handleCallback).toHaveBeenNthCalledWith(1, VALID_WRAPPER, expect.any(Object));
    expect(handleCallback).toHaveBeenNthCalledWith(2, VALID_WRAPPER, expect.any(Object));
  });

  test("passes the request logger to callback processing without a console fallback", async () => {
    const info = mock(() => undefined);
    const handleCallback = mock(async (
      _wrapper: typeof VALID_WRAPPER,
      log?: { info: (metadata: { eventName: string }, message: string) => void },
    ) => {
      log?.info({ eventName: "PACKAGE_AUDIT" }, "ignored trusted Douyin callback event");
    });
    const [route] = await createRoutes({ handleCallback });

    await route!.handler({ body: VALID_WRAPPER, log: { info } }, createReply().reply);

    expect(handleCallback).toHaveBeenCalledWith(VALID_WRAPPER, expect.any(Object));
    expect(info).toHaveBeenCalledWith(
      { eventName: "PACKAGE_AUDIT" },
      "ignored trusted Douyin callback event",
    );
  });

  test("sends raw plaintext through Fastify and fails closed on service errors", async () => {
    const { DouyinThirdPartyEventsController } = await import(".");
    const validApp = Fastify();
    errorHandler(validApp);
    new DouyinThirdPartyEventsController(() => ({
      handleCallback: mock(async () => undefined),
    })).registerExtraRoutes(validApp);

    const validResponse = await validApp.inject({
      method: "POST",
      url: "/douyin-thirdparty/events/message",
      payload: VALID_WRAPPER,
    });
    expect(validResponse.statusCode).toBe(200);
    expect(validResponse.headers["content-type"]).toStartWith("text/plain");
    expect(validResponse.body).toBe("success");

    const malformedResponse = await validApp.inject({
      method: "POST",
      url: "/douyin-thirdparty/events/message",
      payload: { Nonce: "nonce-1" },
    });
    expect(malformedResponse.statusCode).toBe(400);
    expect(malformedResponse.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    await validApp.close();

    const rejectedApp = Fastify();
    errorHandler(rejectedApp);
    new DouyinThirdPartyEventsController(() => ({
      handleCallback: mock(async () => {
        throw Errors.business(
          401,
          "抖音回调签名校验失败",
          "DOUYIN_CALLBACK_SIGNATURE_INVALID",
        );
      }),
    })).registerExtraRoutes(rejectedApp);

    const rejectedResponse = await rejectedApp.inject({
      method: "POST",
      url: "/douyin-thirdparty/events/authorization",
      payload: VALID_WRAPPER,
    });
    expect(rejectedResponse.statusCode).toBe(401);
    expect(rejectedResponse.body).not.toBe("success");
    expect(rejectedResponse.json()).toMatchObject({
      code: "DOUYIN_CALLBACK_SIGNATURE_INVALID",
    });
    await rejectedApp.close();
  });

  test("rejects malformed wrappers before invoking the service", async () => {
    const handleCallback = mock(async () => undefined);
    const [route] = await createRoutes({ handleCallback });

    await expect(route!.handler({ body: { Nonce: "nonce-1" } }, createReply().reply))
      .rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(handleCallback).not.toHaveBeenCalled();
  });

  test("propagates signature failures to the application error handler", async () => {
    const signatureError = Errors.business(
      401,
      "抖音回调签名校验失败",
      "DOUYIN_CALLBACK_SIGNATURE_INVALID",
    );
    const [route] = await createRoutes({
      handleCallback: mock(async () => { throw signatureError; }),
    });

    await expect(route!.handler({ body: VALID_WRAPPER }, createReply().reply))
      .rejects.toBe(signatureError);
  });
});
