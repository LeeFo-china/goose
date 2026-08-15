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
      { method: "POST", path: "/suppliers/code-allocations" },
      { method: "POST", path: "/suppliers/private" },
      { method: "GET", path: "/suppliers/:id" },
      { method: "PATCH", path: "/suppliers/:id/master" },
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
    const handlers: Array<(request: FastifyRequest) => Promise<unknown>> = [
      controller.allocateInternalCode,
      controller.createPrivateSupplier,
      controller.createRelationship,
      controller.activateRelationship,
      controller.suspendRelationship,
      controller.terminateRelationship,
      controller.blacklistRelationship,
      controller.createContract,
      controller.activateContract,
      controller.terminateContract,
    ] as Array<(request: FastifyRequest) => Promise<unknown>>;

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

  test("routes explicit private, shared, allocation, and master commands", async () => {
    const { default: controller } = await import(".");
    const { tenantSuppliersService } = await import("@/services/tenant-suppliers");
    const auth = { tenantId: crypto.randomUUID(), authUserId: crypto.randomUUID() };
    Object.defineProperty(controller, "getRequiredTenantContext", {
      configurable: true,
      value: mock(async () => auth),
    });
    const allocateInternalCode = mock(async (
      _auth: unknown,
      _key: string,
    ) => ({
      allocation_id: crypto.randomUUID(),
      code: "SUP-000001",
      idempotent: false,
    }));
    const createPrivateSupplier = mock(async (
      _auth: unknown,
      _input: unknown,
      _key: string,
    ) => ({ id: "private" }));
    const createSharedRelationship = mock(async (
      _auth: unknown,
      _input: unknown,
      _key: string,
    ) => ({ id: "shared" }));
    const updatePrivateSupplierMaster = mock(async (
      _auth: unknown,
      _relationshipId: string,
      _input: unknown,
    ) => ({ id: "master" }));
    const createContract = mock(async (
      _auth: unknown, _relationshipId: string, _id: string,
      _input: unknown, _key: string,
    ) => ({ id: _id }));
    const updateRelationship = mock(async () => ({ id: "updated" }));
    const originals = {
      allocateInternalCode: tenantSuppliersService.allocateInternalCode,
      createPrivateSupplier: tenantSuppliersService.createPrivateSupplier,
      createSharedRelationship: tenantSuppliersService.createSharedRelationship,
      updatePrivateSupplierMaster:
        tenantSuppliersService.updatePrivateSupplierMaster,
      createContract: tenantSuppliersService.createContract,
      updateRelationship: tenantSuppliersService.updateRelationship,
    };
    Object.assign(tenantSuppliersService, {
      allocateInternalCode,
      createPrivateSupplier,
      createSharedRelationship,
      updatePrivateSupplierMaster,
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
      expect((await routes.get("POST /suppliers/code-allocations")?.(
        request({}), {},
      ))?.message).toBe("success");
      expect((await routes.get("POST /suppliers/private")?.(
        request({
          name: "私有供应商",
          legal_name: "私有供应商有限公司",
          supplier_type: "manufacturer",
          code_source: "generated",
          internal_supplier_code: "SUP-000001",
          allocation_id: crypto.randomUUID(),
        }), {},
      ))?.message).toBe("success");
      expect((await routes.get("POST /suppliers")?.(
        request({
          supplier_id: supplierId,
          code_source: "manual",
          internal_supplier_code: "MY-SUPPLIER",
        }), {},
      ))?.message).toBe("success");
      expect((await routes.get("PATCH /suppliers/:id/master")?.({
        body: { expected_version: 1, name: "私有供应商新名称" },
        params: { id: relationshipId },
        query: {},
        headers: {},
      } as unknown as FastifyRequest, {}))?.message).toBe("success");
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
      expect((await routes.get("PATCH /suppliers/:id")?.({
        body: { expected_version: 1, remark: "普通更新无需幂等键" },
        params: { id: relationshipId },
        query: {},
        headers: {},
      } as unknown as FastifyRequest, {}))?.message).toBe("success");
      expect(allocateInternalCode).toHaveBeenCalledWith(auth, key);
      expect(createPrivateSupplier).toHaveBeenCalledTimes(1);
      expect(createPrivateSupplier.mock.calls[0]?.[2]).toBe(key);
      expect(createSharedRelationship).toHaveBeenCalledTimes(1);
      expect(createSharedRelationship.mock.calls[0]?.[2]).toBe(key);
      expect(updatePrivateSupplierMaster).toHaveBeenCalledWith(
        auth,
        relationshipId,
        { expected_version: 1, name: "私有供应商新名称" },
      );
      expect(createContract).toHaveBeenCalledTimes(1);
      expect(updateRelationship).toHaveBeenCalledTimes(1);
      expect(createContract.mock.calls[0]?.[4]).toBe(key);
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
