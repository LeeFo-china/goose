import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformServiceProductsController routes", () => {
  test("registers platform service product management routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/platform/billing/service-products" },
      { method: "POST", path: "/platform/billing/service-products" },
      { method: "PATCH", path: "/platform/billing/service-products/:id" },
      { method: "POST", path: "/platform/billing/service-products/:id/publish" },
      { method: "POST", path: "/platform/billing/service-products/:id/archive" },
    ]);
  });
});
