import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("WechatPayCallbacksController routes", () => {
  test("registers public callback route with raw body preParsing", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ path: string; options: Record<string, unknown> }> = [];
    const fastify = {
      post: (path: string, options: Record<string, unknown>) => {
        routes.push({ path, options });
      },
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      path: "/pay/wechat/callback",
      options: expect.objectContaining({
        preParsing: expect.any(Function),
      }),
    });
  });
});
