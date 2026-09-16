import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const PROMOTION_ID = "11111111-1111-4111-8111-111111111111";
const IDEMPOTENCY_KEY = "22222222-2222-4222-8222-222222222222";
const authContext = {
  tenantId: null,
  employeeId: "employee-1",
  authUserId: "user-1",
};
const serviceMethods = {
  listPromotions: mock(async () => ({ list: [], pagination: {} })),
  createDraft: mock(async () => ({ promotion: { id: PROMOTION_ID } })),
  saveDraft: mock(async () => ({ promotion: { id: PROMOTION_ID, version: 2 } })),
  publish: mock(async () => ({ promotion: { id: PROMOTION_ID }, idempotent: false })),
  stop: mock(async () => ({ promotion: { id: PROMOTION_ID }, idempotent: false })),
};

type RouteHandler = (
  request: FastifyRequest,
  reply: unknown,
) => Promise<{ data: unknown; message: string }>;
type RegisteredRoute = { method: string; path: string; handler: RouteHandler };

async function loadController() {
  return (await import(".")).default;
}

function registeredRoutes(controller: {
  registerExtraRoutes(fastify: unknown): void;
}): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  const register = (method: string) => (
    path: string,
    optionsOrHandler: object | RouteHandler,
    maybeHandler?: RouteHandler,
  ) => {
    const handler = maybeHandler ?? optionsOrHandler as RouteHandler;
    routes.push({ method, path, handler });
  };
  controller.registerExtraRoutes({
    get: register("GET"),
    post: register("POST"),
    patch: register("PATCH"),
  });
  return routes;
}

function requiredHandler(routes: RegisteredRoute[], key: string) {
  const route = routes.find(({ method, path }) => `${method} ${path}` === key);
  if (!route) throw new TypeError(`missing route: ${key}`);
  return route.handler;
}

function replaceMethod(target: object, method: string, value: unknown) {
  Reflect.set(target, method, value);
}

beforeEach(() => {
  for (const method of Object.values(serviceMethods)) method.mockClear();
});

describe("PlatformServicePromotionsController routes", () => {
  test("registers the exact five platform promotion routes", async () => {
    const routes = registeredRoutes(await loadController());
    expect(routes.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "GET", path: "/platform/billing/service-promotions" },
      { method: "POST", path: "/platform/billing/service-promotions" },
      { method: "PATCH", path: "/platform/billing/service-promotions/:id" },
      { method: "POST", path: "/platform/billing/service-promotions/:id/publish" },
      { method: "POST", path: "/platform/billing/service-promotions/:id/stop" },
    ]);
  });

  test("requires permission, parses each request, delegates, and wraps success", async () => {
    const [{ platformServicePromotionService }, controller] = await Promise.all([
      import("@/services/platform-service-promotions"),
      loadController(),
    ]);
    const originals = Object.fromEntries(Object.keys(serviceMethods).map(
      (name) => [name, Reflect.get(platformServicePromotionService, name)],
    ));
    const originalAuth = Reflect.get(
      controller,
      "getRequiredPlatformPermissionContext",
    );
    const requireContext = mock(async () => authContext);
    replaceMethod(controller, "getRequiredPlatformPermissionContext", requireContext);
    for (const [name, method] of Object.entries(serviceMethods)) {
      replaceMethod(platformServicePromotionService, name, method);
    }
    const routes = registeredRoutes(controller);
    const requests = [
      { query: { page: "2", pageSize: "10" } },
      { body: {} },
      {
        params: { id: PROMOTION_ID },
        body: {
          name: "国庆优惠",
          badge_text: "限时 2 折",
          title: "平台技术服务限时优惠",
          summary: "三档套餐同步优惠",
          rules_text: "仅限活动期新订单",
          discount_rate_basis_points: 2000,
          starts_at: "2026-10-01T00:00:00.000Z",
          ends_at: "2026-10-08T00:00:00.000Z",
          expected_version: 1,
        },
      },
      {
        params: { id: PROMOTION_ID },
        body: { expected_version: 2, idempotency_key: IDEMPOTENCY_KEY },
      },
      {
        params: { id: PROMOTION_ID },
        body: {
          expected_version: 3,
          idempotency_key: IDEMPOTENCY_KEY,
          reason: "运营提前结束",
        },
      },
    ] as const;

    try {
      const responses = await Promise.all([
        requiredHandler(routes, "GET /platform/billing/service-promotions")(
          requests[0] as unknown as FastifyRequest,
          {},
        ),
        requiredHandler(routes, "POST /platform/billing/service-promotions")(
          requests[1] as unknown as FastifyRequest,
          {},
        ),
        requiredHandler(routes, "PATCH /platform/billing/service-promotions/:id")(
          requests[2] as unknown as FastifyRequest,
          {},
        ),
        requiredHandler(routes, "POST /platform/billing/service-promotions/:id/publish")(
          requests[3] as unknown as FastifyRequest,
          {},
        ),
        requiredHandler(routes, "POST /platform/billing/service-promotions/:id/stop")(
          requests[4] as unknown as FastifyRequest,
          {},
        ),
      ]);

      expect(serviceMethods.listPromotions).toHaveBeenCalledWith(authContext, {
        page: 2,
        pageSize: 10,
      });
      expect(serviceMethods.createDraft).toHaveBeenCalledWith(authContext, {
        name: "平台技术服务限时优惠",
        badge_text: "限时 2 折",
        title: "平台技术服务限时优惠",
        summary: "1 年、2 年、3 年套餐同步限时优惠",
        rules_text: "",
        discount_rate_basis_points: 2000,
        starts_at: null,
        ends_at: null,
      });
      expect(serviceMethods.saveDraft).toHaveBeenCalledWith(
        authContext,
        PROMOTION_ID,
        requests[2].body,
      );
      expect(serviceMethods.publish).toHaveBeenCalledWith(
        authContext,
        PROMOTION_ID,
        requests[3].body,
      );
      expect(serviceMethods.stop).toHaveBeenCalledWith(
        authContext,
        PROMOTION_ID,
        requests[4].body,
      );
      expect(requireContext).toHaveBeenCalledTimes(5);
      for (let index = 0; index < requests.length; index += 1) {
        expect(requireContext).toHaveBeenNthCalledWith(
          index + 1,
          requests[index],
          "platform.service_product.manage",
        );
      }
      expect(responses).toEqual([
        { data: { list: [], pagination: {} }, message: "success" },
        { data: { promotion: { id: PROMOTION_ID } }, message: "success" },
        { data: { promotion: { id: PROMOTION_ID, version: 2 } }, message: "success" },
        {
          data: { promotion: { id: PROMOTION_ID }, idempotent: false },
          message: "success",
        },
        {
          data: { promotion: { id: PROMOTION_ID }, idempotent: false },
          message: "success",
        },
      ]);
    } finally {
      replaceMethod(controller, "getRequiredPlatformPermissionContext", originalAuth);
      for (const [name, method] of Object.entries(originals)) {
        replaceMethod(platformServicePromotionService, name, method);
      }
    }
  });

  test("rejects client codes and invalid query, params, or command bodies before delegation", async () => {
    const [{ platformServicePromotionService }, controller] = await Promise.all([
      import("@/services/platform-service-promotions"),
      loadController(),
    ]);
    const originals = Object.fromEntries(Object.keys(serviceMethods).map(
      (name) => [name, Reflect.get(platformServicePromotionService, name)],
    ));
    const originalAuth = Reflect.get(
      controller,
      "getRequiredPlatformPermissionContext",
    );
    replaceMethod(
      controller,
      "getRequiredPlatformPermissionContext",
      mock(async () => authContext),
    );
    for (const [name, method] of Object.entries(serviceMethods)) {
      replaceMethod(platformServicePromotionService, name, method);
    }
    const routes = registeredRoutes(controller);
    const invalidRequests = [
      ["GET /platform/billing/service-promotions", { query: { pageSize: "101" } }],
      ["POST /platform/billing/service-promotions", { body: { code: "client-code" } }],
      ["PATCH /platform/billing/service-promotions/:id", {
        params: { id: "bad-id" },
        body: {},
      }],
      ["POST /platform/billing/service-promotions/:id/publish", {
        params: { id: PROMOTION_ID },
        body: { expected_version: 0, idempotency_key: IDEMPOTENCY_KEY },
      }],
      ["POST /platform/billing/service-promotions/:id/stop", {
        params: { id: PROMOTION_ID },
        body: {
          expected_version: 1,
          idempotency_key: IDEMPOTENCY_KEY,
          reason: " ",
        },
      }],
    ] as const;

    try {
      for (const [key, request] of invalidRequests) {
        await expect(requiredHandler(routes, key)(
          request as unknown as FastifyRequest,
          {},
        )).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
      }
      for (const method of Object.values(serviceMethods)) {
        expect(method).not.toHaveBeenCalled();
      }
    } finally {
      replaceMethod(controller, "getRequiredPlatformPermissionContext", originalAuth);
      for (const [name, method] of Object.entries(originals)) {
        replaceMethod(platformServicePromotionService, name, method);
      }
    }
  });

  test("registers once, keeps the HTTP boundary, and exposes audit literals", async () => {
    const [routeIndex, controllerSource, auditSource] = await Promise.all([
      Bun.file(new URL("../../routes/index.ts", import.meta.url)).text(),
      Bun.file(new URL("./index.ts", import.meta.url)).text(),
      Bun.file(new URL("../../schema/platform-audit-logs.ts", import.meta.url)).text(),
    ]);

    expect(routeIndex.match(/import PlatformServicePromotionsController /g))
      .toHaveLength(1);
    expect(routeIndex.match(
      /PlatformServicePromotionsController\.registerExtraRoutes\(app\)/g,
    )).toHaveLength(1);
    expect(controllerSource).toContain("extends PlatformBaseController");
    expect(controllerSource.match(/getRequiredPlatformPermissionContext/g))
      .toHaveLength(5);
    expect(controllerSource.match(/ResponseHandler\.success/g)).toHaveLength(5);
    expect(controllerSource).not.toContain("throw new Error");
    expect(controllerSource).not.toContain(".from(");
    expect(controllerSource).not.toContain(".rpc(");
    for (const action of [
      "platform_service_promotion_create",
      "platform_service_promotion_update",
      "platform_service_promotion_publish",
      "platform_service_promotion_stop",
    ]) {
      expect(auditSource).toContain(`"${action}"`);
    }
  });
});
