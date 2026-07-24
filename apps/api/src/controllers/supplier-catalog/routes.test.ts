import { describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("SupplierCatalogController routes", () => {
  test("registers the explicit tenant catalog routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/catalog/categories" },
      { method: "GET", path: "/catalog/brands" },
      { method: "GET", path: "/catalog/units" },
    ]);
  });

  test("passes tenant auth and a validated paginated query once", async () => {
    const { default: controller } = await import(".");
    const { supplierCatalogService } = await import("@/services/supplier-catalog");
    const auth = { tenantId: crypto.randomUUID() };
    Object.defineProperty(controller, "getRequiredTenantContext", {
      configurable: true,
      value: mock(async () => auth),
    });
    const listTenantCategories = mock(async () => ({
      list: [],
      pagination: { page: 2, pageSize: 10, total: 0, totalPages: 0 },
    }));
    const original = supplierCatalogService.listTenantCategories;
    Object.assign(supplierCatalogService, { listTenantCategories });
    const routes = registeredHandlers(controller);

    try {
      const response = await routes.get("GET /catalog/categories")?.({
        body: {},
        params: {},
        headers: {},
        query: { page: "2", pageSize: "10", status: "inactive" },
      } as unknown as FastifyRequest, {});
      expect(response?.message).toBe("success");
      expect(listTenantCategories).toHaveBeenCalledWith(auth, {
        page: 2,
        pageSize: 10,
        status: "inactive",
      });
      expect(listTenantCategories).toHaveBeenCalledTimes(1);
    } finally {
      Object.assign(supplierCatalogService, {
        listTenantCategories: original,
      });
      Reflect.deleteProperty(controller, "getRequiredTenantContext");
    }
  });

  test("passes a validated unit-kind query to the tenant service", async () => {
    const { default: controller } = await import(".");
    const { supplierCatalogService } = await import("@/services/supplier-catalog");
    const auth = { tenantId: crypto.randomUUID() };
    Object.defineProperty(controller, "getRequiredTenantContext", {
      configurable: true,
      value: mock(async () => auth),
    });
    const listTenantUnits = mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    }));
    const original = supplierCatalogService.listTenantUnits;
    Object.assign(supplierCatalogService, { listTenantUnits });

    try {
      await controller.listUnits({
        query: { unit_kind: "base" },
      } as unknown as FastifyRequest);
      expect(listTenantUnits).toHaveBeenCalledWith(auth, {
        page: 1,
        pageSize: 20,
        unit_kind: "base",
      });
    } finally {
      Object.assign(supplierCatalogService, { listTenantUnits: original });
      Reflect.deleteProperty(controller, "getRequiredTenantContext");
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
    (path: string, handler: RouteHandler) =>
      routes.set(`${method} ${path}`, handler);
  controller.registerExtraRoutes({ get: register("GET") });
  return routes;
}
