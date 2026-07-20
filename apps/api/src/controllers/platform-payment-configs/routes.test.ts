import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformPaymentConfigsController routes", () => {
  test("registers platform wechat pay config profile routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      put: (path: string) => routes.push({ method: "PUT", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/platform/payment/wechat-pay/config" },
      { method: "PUT", path: "/platform/payment/wechat-pay/config" },
      { method: "GET", path: "/platform/payment/wechat-pay/profiles" },
      { method: "GET", path: "/platform/payment/wechat-pay/readiness" },
      {
        method: "GET",
        path: "/platform/payment/wechat-pay/profiles/:profileCode/config",
      },
      {
        method: "PUT",
        path: "/platform/payment/wechat-pay/profiles/:profileCode/config",
      },
      {
        method: "PUT",
        path: "/platform/payment/wechat-pay/profiles/:profileCode/secret-bundle",
      },
      {
        method: "POST",
        path: "/platform/payment/wechat-pay/profiles/:profileCode/validate",
      },
    ]);
  });
});
