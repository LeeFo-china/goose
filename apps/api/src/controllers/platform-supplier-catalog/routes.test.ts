import { describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformSupplierCatalogController routes", () => {
  test("registers the explicit platform catalog routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/platform/catalog/categories" },
      { method: "POST", path: "/platform/catalog/categories" },
      { method: "PATCH", path: "/platform/catalog/categories/:id" },
      { method: "GET", path: "/platform/catalog/brands" },
      { method: "POST", path: "/platform/catalog/brands" },
      { method: "PATCH", path: "/platform/catalog/brands/:id" },
      { method: "GET", path: "/platform/catalog/units" },
      { method: "POST", path: "/platform/catalog/units" },
      { method: "PATCH", path: "/platform/catalog/units/:id" },
    ]);
  });

  test("rejects every create route without an idempotency key", async () => {
    const { default: controller } = await import(".");
    Object.defineProperty(controller, "getRequiredPlatformPermissionContext", {
      configurable: true,
      value: async () => ({ isPlatformAdmin: true }),
    });
    const request = {
      body: {},
      headers: {},
      params: {},
      query: {},
    } as FastifyRequest;
    const handlers: Array<() => Promise<unknown>> = [
      () => controller.createCategory(request),
      () => controller.createBrand(request),
      () => controller.createUnit(request),
    ];

    try {
      for (const handler of handlers) {
        await expect(handler()).rejects.toMatchObject({
          statusCode: 400,
          code: "VALIDATION_ERROR",
        });
      }
    } finally {
      Reflect.deleteProperty(controller, "getRequiredPlatformPermissionContext");
    }
  });

  test("passes auth, parsed body, and key to all three create services", async () => {
    const { default: controller } = await import(".");
    const { supplierCatalogService } = await import(
      "@/services/supplier-catalog"
    );
    const auth = { isPlatformAdmin: true, authUserId: crypto.randomUUID() };
    Object.defineProperty(controller, "getRequiredPlatformPermissionContext", {
      configurable: true,
      value: mock(async () => auth),
    });
    const createCategory = mock(async () => ({
      status: "created",
      idempotent: false,
      category: { id: crypto.randomUUID() },
      version: 1,
    }));
    const createBrand = mock(async () => ({
      status: "created",
      idempotent: false,
      brand: { id: crypto.randomUUID() },
      version: 1,
    }));
    const createUnit = mock(async () => ({
      status: "created",
      idempotent: false,
      unit: { id: crypto.randomUUID(), conversion_factor: "1" },
      version: 1,
    }));
    const originals = {
      createCategory: supplierCatalogService.createCategory,
      createBrand: supplierCatalogService.createBrand,
      createUnit: supplierCatalogService.createUnit,
    };
    Object.assign(supplierCatalogService, {
      createCategory,
      createBrand,
      createUnit,
    });
    const routes = registeredHandlers(controller);
    const key = "catalog-route-create-1";
    const inputs = [
      {
        path: "/platform/catalog/categories",
        body: {
          parent_id: null,
          code: "CAT-001",
          name: "主材",
          level: 1,
          status: "active",
          sort_order: 100,
        },
      },
      {
        path: "/platform/catalog/brands",
        body: {
          code: "BR-001",
          name: "雨虹",
          status: "active",
          sort_order: 100,
        },
      },
      {
        path: "/platform/catalog/units",
        body: {
          code: "UNIT-BOX",
          name: "箱",
          symbol: "箱",
          base_unit_id: null,
          conversion_factor: "1",
          status: "active",
          sort_order: 100,
        },
      },
    ];

    try {
      for (const input of inputs) {
        const response = await routes.get(`POST ${input.path}`)?.({
          body: input.body,
          headers: { "idempotency-key": key },
          params: {},
          query: {},
        } as unknown as FastifyRequest, {});
        expect(response?.message).toBe("success");
      }
      expect(createCategory).toHaveBeenCalledWith(auth, inputs[0]?.body, key);
      expect(createBrand).toHaveBeenCalledWith(auth, inputs[1]?.body, key);
      expect(createUnit).toHaveBeenCalledWith(auth, inputs[2]?.body, key);
      expect(createCategory).toHaveBeenCalledTimes(1);
      expect(createBrand).toHaveBeenCalledTimes(1);
      expect(createUnit).toHaveBeenCalledTimes(1);
    } finally {
      Object.assign(supplierCatalogService, originals);
      Reflect.deleteProperty(controller, "getRequiredPlatformPermissionContext");
    }
  });
});

type RouteHandler = (
  request: FastifyRequest,
  reply: unknown,
) => Promise<{ data: unknown; message: string }>;

function registeredHandlers(controller: {
  registerExtraRoutes(fastify: unknown): void;
}) {
  const routes = new Map<string, RouteHandler>();
  const register = (method: string) =>
    (path: string, optionsOrHandler: unknown, handler?: RouteHandler) => {
      const routeHandler = handler ?? optionsOrHandler;
      if (typeof routeHandler !== "function") {
        throw new TypeError(`invalid route handler: ${method} ${path}`);
      }
      routes.set(`${method} ${path}`, routeHandler as RouteHandler);
    };
  controller.registerExtraRoutes({
    get: register("GET"),
    post: register("POST"),
    patch: register("PATCH"),
  });
  return routes;
}
