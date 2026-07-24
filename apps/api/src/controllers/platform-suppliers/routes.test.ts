import { describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformSuppliersController routes", () => {
  test("registers the explicit platform supplier routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/platform/suppliers" },
      { method: "POST", path: "/platform/suppliers" },
      { method: "GET", path: "/platform/supplier-qualification-types" },
      { method: "POST", path: "/platform/supplier-qualification-types" },
      { method: "PATCH", path: "/platform/supplier-qualification-types/:id" },
      { method: "GET", path: "/platform/suppliers/:id" },
      { method: "PATCH", path: "/platform/suppliers/:id" },
      { method: "POST", path: "/platform/suppliers/:id/submit" },
      { method: "POST", path: "/platform/suppliers/:id/approve" },
      { method: "POST", path: "/platform/suppliers/:id/reject" },
      { method: "POST", path: "/platform/suppliers/:id/suspend" },
      { method: "POST", path: "/platform/suppliers/:id/resume" },
      { method: "POST", path: "/platform/suppliers/:id/blacklist" },
      { method: "GET", path: "/platform/suppliers/:id/qualifications" },
      { method: "POST", path: "/platform/suppliers/:id/qualifications" },
      {
        method: "PATCH",
        path: "/platform/suppliers/:id/qualifications/:qualificationId",
      },
      {
        method: "POST",
        path: "/platform/suppliers/:id/qualifications/:qualificationId/verify",
      },
      {
        method: "POST",
        path: "/platform/suppliers/:id/qualifications/:qualificationId/reject",
      },
      { method: "GET", path: "/platform/suppliers/:id/service-regions" },
      { method: "POST", path: "/platform/suppliers/:id/service-regions" },
      {
        method: "PATCH",
        path: "/platform/suppliers/:id/service-regions/:regionId",
      },
      { method: "GET", path: "/platform/suppliers/:id/addresses" },
      { method: "POST", path: "/platform/suppliers/:id/addresses" },
      {
        method: "PATCH",
        path: "/platform/suppliers/:id/addresses/:addressId",
      },
      { method: "GET", path: "/platform/suppliers/:id/contacts" },
      { method: "POST", path: "/platform/suppliers/:id/contacts" },
      {
        method: "PATCH",
        path: "/platform/suppliers/:id/contacts/:contactId",
      },
      { method: "GET", path: "/platform/suppliers/:id/events" },
      {
        method: "GET",
        path: "/platform/tenant-supplier-settings/:tenantId",
      },
      {
        method: "PATCH",
        path: "/platform/tenant-supplier-settings/:tenantId",
      },
    ]);
  });

  test("rejects every create and command route without an idempotency key", async () => {
    const { default: controller } = await import(".");
    Object.defineProperty(controller, "getRequiredPlatformAdminContext", {
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
      () => controller.createSupplier(request),
      () => controller.createQualificationType(request),
      () => controller.submitSupplier(request),
      () => controller.approveSupplier(request),
      () => controller.rejectSupplier(request),
      () => controller.suspendSupplier(request),
      () => controller.resumeSupplier(request),
      () => controller.blacklistSupplier(request),
      () => controller.createQualification(request),
      () => controller.verifyQualification(request),
      () => controller.rejectQualification(request),
      () => controller.createServiceRegion(request),
      () => controller.createAddress(request),
      () => controller.createContact(request),
      () => controller.setTenantSupplierSettings(request),
    ];

    try {
      for (const handler of handlers) {
        await expect(handler()).rejects.toMatchObject({
          statusCode: 400,
          code: "VALIDATION_ERROR",
        });
      }
    } finally {
      Reflect.deleteProperty(controller, "getRequiredPlatformAdminContext");
    }
  });

  test("passes auth, validated payload, and idempotency key to every create service", async () => {
    const { default: controller } = await import(".");
    const { platformSuppliersService } = await import(
      "@/services/platform-suppliers"
    );
    const auth = { isPlatformAdmin: true, authUserId: crypto.randomUUID() };
    Object.defineProperty(controller, "getRequiredPlatformAdminContext", {
      configurable: true,
      value: mock(async () => auth),
    });
    const firstSupplierId = crypto.randomUUID();
    const createSupplier = mock(async (
      _auth: unknown,
      _request: { supplierId: string },
    ) => ({
      status: "created",
      idempotent: false,
      supplier: { id: firstSupplierId },
      version: 1,
    }));
    const createQualificationType = mock(async () => ({
      status: "created",
      idempotent: false,
      qualification_type: { id: crypto.randomUUID() },
      version: 1,
    }));
    const createQualification = mock(async () => ({
      status: "created",
      idempotent: false,
      qualification: { id: crypto.randomUUID() },
      version: 1,
    }));
    const createServiceRegion = mock(async () => ({
      status: "created",
      idempotent: false,
      service_region: { id: crypto.randomUUID() },
      version: 1,
    }));
    const createAddress = mock(async () => ({
      status: "created",
      idempotent: false,
      address: { id: crypto.randomUUID() },
      version: 1,
    }));
    const createContact = mock(async () => ({
      status: "created",
      idempotent: false,
      contact: { id: crypto.randomUUID() },
      version: 1,
    }));
    const originals = {
      createSupplier: platformSuppliersService.createSupplier,
      createQualificationType: platformSuppliersService.createQualificationType,
      createQualification: platformSuppliersService.createQualification,
      createServiceRegion:
        Reflect.get(platformSuppliersService, "createServiceRegion"),
      createAddress: Reflect.get(platformSuppliersService, "createAddress"),
      createContact: Reflect.get(platformSuppliersService, "createContact"),
    };
    Object.assign(platformSuppliersService, {
      createSupplier,
      createQualificationType,
      createQualification,
      createServiceRegion,
      createAddress,
      createContact,
    });
    const routes = registeredHandlers(controller);
    const supplierId = crypto.randomUUID();
    const typeId = crypto.randomUUID();
    const key = "platform-route-create-1";
    const calls = [
      {
        path: "/platform/suppliers",
        body: {
          code: "SUP-001",
          name: "晴天建材",
          legal_name: "晴天建材有限公司",
          supplier_type: "manufacturer",
        },
      },
      {
        path: "/platform/supplier-qualification-types",
        body: {
          code: "LICENSE",
          name: "营业执照",
          applicable_supplier_types: [],
          warning_days: 30,
          is_required: true,
          blocks_new_orders: true,
          status: "active",
          sort_order: 100,
        },
      },
      {
        path: "/platform/suppliers/:id/qualifications",
        params: { id: supplierId },
        body: {
          qualification_type_id: typeId,
          document_file_id: crypto.randomUUID(),
        },
      },
      {
        path: "/platform/suppliers/:id/service-regions",
        params: { id: supplierId },
        body: {
          region_code: "411502",
          region_level: "district",
          status: "active",
        },
      },
      {
        path: "/platform/suppliers/:id/addresses",
        params: { id: supplierId },
        body: {
          address_type: "registered",
          region_code: "411502",
          address_detail: "测试路 1 号",
          is_default: true,
          status: "active",
        },
      },
      {
        path: "/platform/suppliers/:id/contacts",
        params: { id: supplierId },
        body: {
          contact_type: "primary",
          name: "张三",
          is_public: true,
          is_primary: true,
          status: "active",
        },
      },
    ];

    try {
      const responses = [];
      for (const call of calls) {
        responses.push(await routes.get(`POST ${call.path}`)?.({
          body: call.body,
          headers: { "idempotency-key": key },
          params: call.params ?? {},
          query: {},
        } as unknown as FastifyRequest, {}));
      }
      expect(responses.every((response) =>
        response?.message === "success")).toBe(true);
      expect(createQualificationType).toHaveBeenCalledWith(
        auth,
        calls[1]?.body,
        key,
      );
      expect(createQualification).toHaveBeenCalledWith(
        auth,
        expect.objectContaining({ supplier_id: supplierId }),
        key,
      );
      expect(createServiceRegion).toHaveBeenCalledWith(
        auth,
        expect.objectContaining({ supplier_id: supplierId }),
        key,
      );
      expect(createAddress).toHaveBeenCalledWith(
        auth,
        expect.objectContaining({ supplier_id: supplierId }),
        key,
      );
      expect(createContact).toHaveBeenCalledWith(
        auth,
        expect.objectContaining({ supplier_id: supplierId }),
        key,
      );
      for (const service of [
        createSupplier,
        createQualificationType,
        createQualification,
        createServiceRegion,
        createAddress,
        createContact,
      ]) {
        expect(service).toHaveBeenCalledTimes(1);
      }

      await routes.get("POST /platform/suppliers")?.({
        body: calls[0]?.body,
        headers: { "idempotency-key": key },
        params: {},
        query: {},
      } as unknown as FastifyRequest, {});
      const supplierIds = createSupplier.mock.calls.map(
        (call) => call[1].supplierId,
      );
      expect(supplierIds[0]).not.toBe(supplierIds[1]);
    } finally {
      Object.assign(platformSuppliersService, originals);
      Reflect.deleteProperty(controller, "getRequiredPlatformAdminContext");
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
    (path: string, handler: RouteHandler) => routes.set(`${method} ${path}`, handler);
  controller.registerExtraRoutes({
    get: register("GET"),
    post: register("POST"),
    patch: register("PATCH"),
  });
  return routes;
}
