import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("BillingServiceOrdersController routes", () => {
  test("registers tenant service product and order routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/billing/service-products" },
      { method: "GET", path: "/billing/service-orders" },
      { method: "POST", path: "/billing/service-orders" },
      { method: "GET", path: "/billing/service-orders/:id" },
      {
        method: "POST",
        path: "/billing/service-orders/:id/payment-request",
      },
      { method: "POST", path: "/billing/service-orders/:id/refund-requests" },
    ]);
  });
});
