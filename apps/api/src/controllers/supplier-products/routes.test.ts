import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("SupplierProductsController routes", () => {
  test("registers explicit product and SKU routes", async () => {
    const { default: controller } = await import(".");
    const routes: string[] = [];
    const register = (method: string) => (path: string) =>
      routes.push(`${method} ${path}`);

    controller.registerExtraRoutes({
      get: register("GET"),
      post: register("POST"),
      patch: register("PATCH"),
      put: register("PUT"),
    } as never);

    expect(routes).toEqual([
      "GET /supplier-products",
      "GET /supplier-products/:id",
      "POST /supplier-products/:id",
      "PATCH /supplier-products/:id",
      "POST /supplier-products/:id/activate",
      "POST /supplier-products/:id/deactivate",
      "GET /supplier-products/:id/skus",
      "POST /supplier-products/:id/skus/:skuId",
      "PATCH /supplier-products/:id/skus/:skuId",
      "PUT /supplier-products/:id/skus/:skuId/unit-conversions",
      "GET /supplier-products/:id/skus/:skuId/unit-conversions",
      "POST /supplier-products/:id/skus/:skuId/activate",
      "POST /supplier-products/:id/skus/:skuId/deactivate",
    ]);
  });
});
