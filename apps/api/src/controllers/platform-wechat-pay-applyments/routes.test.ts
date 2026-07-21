import { describe, expect, test } from "bun:test";

import { SubmitWechatPayApplymentToWechatSchema } from "@/schema/wechat-pay-applyments";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformWechatPayApplymentsController routes", () => {
  test("registers the official WeChat applyment submission route", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      put: (path: string) => routes.push({ method: "PUT", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toContainEqual({
      method: "POST",
      path: "/platform/finance/wechat-pay/applyments/:id/submit-to-wechat",
    });
  });

  test("accepts only an empty submission body", () => {
    expect(SubmitWechatPayApplymentToWechatSchema.safeParse({}).success).toBe(
      true,
    );
    expect(SubmitWechatPayApplymentToWechatSchema.safeParse({
      merchant_id: "caller-controlled",
    }).success).toBe(false);
  });
});
