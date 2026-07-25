import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("CustomerWechatPaySmokeController routes", () => {
  test("registers customer smoke order routes", async () => {
    const { default: controller } = await import("./wechat-pay-smoke-controller");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      {
        method: "POST",
        path: "/customer/wechat-pay/smoke-test-orders",
      },
      {
        method: "GET",
        path: "/customer/wechat-pay/smoke-test-orders/:id",
      },
    ]);
  });
});
