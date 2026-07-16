import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformBillingRechargeRefundController routes", () => {
  test("registers platform recharge refund review routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/platform/billing/recharge-refund-requests" },
      { method: "GET", path: "/platform/billing/recharge-refund-requests/:id" },
      { method: "POST", path: "/platform/billing/recharge-refund-requests/:id/approve" },
      { method: "POST", path: "/platform/billing/recharge-refund-requests/:id/reject" },
      { method: "POST", path: "/platform/billing/recharge-refund-requests/:id/execute" },
    ]);
  });
});
