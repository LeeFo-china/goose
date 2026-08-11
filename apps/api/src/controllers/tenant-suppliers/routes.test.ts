import { describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("TenantSuppliersController routes", () => {
  test("registers the explicit tenant supplier routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/supplier-settings" },
      { method: "PATCH", path: "/supplier-settings/contract-policy" },
      { method: "GET", path: "/suppliers" },
      { method: "GET", path: "/suppliers/directory" },
      { method: "POST", path: "/suppliers" },
      { method: "GET", path: "/suppliers/:id" },
      { method: "PATCH", path: "/suppliers/:id" },
      { method: "POST", path: "/suppliers/:id/activate" },
      { method: "POST", path: "/suppliers/:id/suspend" },
      { method: "POST", path: "/suppliers/:id/terminate" },
      { method: "POST", path: "/suppliers/:id/blacklist" },
      { method: "GET", path: "/suppliers/:id/order-eligibility" },
      { method: "GET", path: "/suppliers/:id/contracts" },
      { method: "POST", path: "/suppliers/:id/contracts" },
      {
        method: "PATCH",
        path: "/suppliers/:id/contracts/:contractId",
      },
      {
        method: "POST",
        path: "/suppliers/:id/contracts/:contractId/activate",
      },
      {
        method: "POST",
        path: "/suppliers/:id/contracts/:contractId/terminate",
      },
      { method: "GET", path: "/suppliers/:id/events" },
    ]);
  });

  test("rejects every create and command route without an idempotency key", async () => {
    const { default: controller } = await import(".");
    Object.defineProperty(controller, "getRequiredTenantContext", {
      configurable: true,
      value: async () => ({ tenantId: crypto.randomUUID() }),
    });
    const request = {
      body: {},
      headers: {},
      params: {},
      query: {},
    } as FastifyRequest;
    const handlers = [
      controller.createRelationship,
      controller.activateRelationship,
      controller.suspendRelationship,
      controller.terminateRelationship,
      controller.blacklistRelationship,
      controller.createContract,
      controller.activateContract,
      controller.terminateContract,
    ];

    try {
      for (const handler of handlers) {
        await expect(handler.call(controller, request)).rejects.toMatchObject({
          statusCode: 400,
          code: "VALIDATION_ERROR",
        });
      }
    } finally {
      Reflect.deleteProperty(controller, "getRequiredTenantContext");
    }
  });

  test("passes validated creates and ordinary patch to each service once", async () => {
    const { default: controller } = await import(".");
    const { tenantSuppliersService } = await import("@/services/tenant-suppliers");
    const auth = { tenantId: crypto.randomUUID(), authUserId: crypto.randomUUID() };
    Object.defineProperty(controller, "getRequiredTenantContext", {
      configurable: true,
      value: mock(async () => auth),
    });
    const createRelationship = mock(async (
      _auth: unknown, _id: string, _input: unknown, _key: string,
    ) => ({ id: _id }));
    const createContract = mock(async (
      _auth: unknown, _relationshipId: string, _id: string,
      _input: unknown, _key: string,
    ) => ({ id: _id }));
    const updateRelationship = mock(async () => ({ id: "updated" }));
    const originals = {
      createRelationship: tenantSuppliersService.createRelationship,
      createContract: tenantSuppliersService.createContract,
      updateRelationship: tenantSuppliersService.updateRelationship,
    };
    Object.assign(tenantSuppliersService, {
      createRelationship,
      createContract,
      updateRelationship,
    });
    const routes = registeredHandlers(controller);
    const relationshipId = crypto.randomUUID();
    const supplierId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    const key = "tenant-create-1";
    const request = (body: unknown, params: object = {}) => ({
      body,
      params,
      query: {},
      headers: { "idempotency-key": key },
    } as unknown as FastifyRequest);

    try {
      for (let retry = 0; retry < 2; retry += 1) {
        expect((await routes.get("POST /suppliers")?.(
          request({ supplier_id: supplierId }), {},
        ))?.message).toBe("success");
        expect((await routes.get("POST /suppliers/:id/contracts")?.(
          request({
            contract_no: "HT-001",
            name: "年度供货合同",
            valid_from: "2026-01-01",
            valid_until: "2026-12-31",
            settlement_term_days: 30,
            invoice_required_before_payment: true,
            document_file_id: documentId,
          }, { id: relationshipId }), {},
        ))?.message).toBe("success");
      }
      expect((await routes.get("PATCH /suppliers/:id")?.({
        body: { expected_version: 1, remark: "普通更新无需幂等键" },
        params: { id: relationshipId },
        query: {},
        headers: {},
      } as unknown as FastifyRequest, {}))?.message).toBe("success");
      expect(createRelationship).toHaveBeenCalledTimes(2);
      expect(createContract).toHaveBeenCalledTimes(2);
      expect(updateRelationship).toHaveBeenCalledTimes(1);
      expect(createRelationship.mock.calls[0]?.[3]).toBe(key);
      expect(createContract.mock.calls[0]?.[4]).toBe(key);
      expect(createRelationship.mock.calls[0]?.[1])
        .not.toBe(createRelationship.mock.calls[1]?.[1]);
      expect(createContract.mock.calls[0]?.[2])
        .not.toBe(createContract.mock.calls[1]?.[2]);
    } finally {
      Object.assign(tenantSuppliersService, originals);
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
