import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("SupplierPriceListsController routes", () => {
  test("registers explicit draft, item and lifecycle routes", async () => {
    const { default: controller } = await import(".");
    const routes: string[] = [];
    const register = (method: string) => (path: string) =>
      routes.push(`${method} ${path}`);

    controller.registerExtraRoutes({
      get: register("GET"),
      post: register("POST"),
      patch: register("PATCH"),
      put: register("PUT"),
      delete: register("DELETE"),
    } as never);

    expect(routes).toEqual([
      "GET /supplier-price-lists",
      "GET /supplier-price-lists/:id",
      "POST /supplier-price-lists/:id",
      "PATCH /supplier-price-lists/:id",
      "GET /supplier-price-lists/:id/items",
      "PUT /supplier-price-lists/:id/items/:itemId",
      "DELETE /supplier-price-lists/:id/items/:itemId",
      "POST /supplier-price-lists/:id/publish",
      "POST /supplier-price-lists/:id/new-version",
      "POST /supplier-price-lists/:id/retire",
    ]);
  });
});
