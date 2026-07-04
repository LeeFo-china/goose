import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformPartnerRevenueController routes", () => {
  test("registers platform partner revenue and settlement routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/platform/partner-revenue/events" },
      { method: "POST", path: "/platform/partner-revenue/lead-service-fees" },
      { method: "POST", path: "/platform/partner-revenue/recharge-events/sync" },
      { method: "GET", path: "/platform/partner-commissions" },
      { method: "GET", path: "/platform/partner-settlements" },
      { method: "POST", path: "/platform/partner-settlements/monthly-batches" },
      { method: "POST", path: "/platform/partner-settlements/:id/mark-paid" },
    ]);
  });
});
