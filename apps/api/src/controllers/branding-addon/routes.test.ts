import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

import type { FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_USER_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";
const IDEMPOTENCY_KEY = "55555555-5555-4555-8555-555555555555";
const OPENID = "openid-from-verified-wechat-token";

const platformAuth = {
  authUserId: AUTH_USER_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  employeeId: EMPLOYEE_ID,
  employeeName: "平台管理员",
  employeeStatus: "active",
  isPlatformAdmin: true,
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [{ code: "platform.branding_product.manage", scope: "all" }],
} satisfies AuthContext;

const tenantAuth = {
  ...platformAuth,
  tenantId: TENANT_ID,
  tenantName: "测试租户",
  tenantSlug: "test-tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  roleCodes: ["system_admin"],
  permissions: [
    { code: "brand.entitlement.purchase", scope: "all" },
    { code: "brand.entitlement_order.read", scope: "all" },
  ],
} satisfies AuthContext;

type RouteResponse = { data: unknown; message: string };
type RouteHandler = (
  request: FastifyRequest,
  reply: unknown,
) => Promise<RouteResponse>;

async function loadHarness() {
  const [
    { default: controller },
    { authorizationService },
    { platformBrandingAddonProductService },
    { tenantBrandingAddonOrderService },
  ] = await Promise.all([
    import("."),
    import("@/services/authorization"),
    import("@/services/platform-branding-addon-product"),
    import("@/services/tenant-branding-addon-orders"),
  ]);
  return {
    controller,
    authorizationService,
    platformBrandingAddonProductService,
    tenantBrandingAddonOrderService,
  };
}

function registeredHandlers(controller: {
  registerExtraRoutes(fastify: unknown): void;
}) {
  const routes = new Map<string, RouteHandler>();
  const register = (method: string) =>
    (path: string, handler: RouteHandler) =>
      routes.set(`${method} ${path}`, handler);
  controller.registerExtraRoutes({
    get: register("GET"),
    patch: register("PATCH"),
    post: register("POST"),
  });
  return routes;
}

function requiredHandler(
  controller: { registerExtraRoutes(fastify: unknown): void },
  route: string,
) {
  const handler = registeredHandlers(controller).get(route);
  if (!handler) throw new TypeError(`missing route handler: ${route}`);
  return handler;
}

function replaceMethod(
  target: object,
  method: string,
  implementation: unknown,
): void {
  Reflect.set(target, method, implementation);
}

describe("BrandingAddonController routes", () => {
  test("registers product, tenant order, and platform audit order routes", async () => {
    const { controller } = await loadHarness();
    expect([...registeredHandlers(controller).keys()]).toEqual([
      "GET /platform/branding/entitlement-product",
      "PATCH /platform/branding/entitlement-product",
      "GET /platform/branding/entitlement-orders",
      "GET /platform/branding/entitlement-orders/:id",
      "GET /tenant/branding/entitlement-product",
      "POST /tenant/branding/entitlement-orders",
      "POST /tenant/branding/entitlement-orders/:id/payment-request",
      "GET /tenant/branding/entitlement-orders",
      "GET /tenant/branding/entitlement-orders/:id",
    ]);
  });

  test("uses platform auth context for product reads and updates", async () => {
    const {
      authorizationService,
      controller,
      platformBrandingAddonProductService,
    } = await loadHarness();
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      get: platformBrandingAddonProductService.get,
      update: platformBrandingAddonProductService.update,
    };
    const get = mock(async () => ({ product: { version: 1 } }));
    const update = mock(async () => ({ product: { version: 2 } }));
    authorizationService.getRequiredAuthContext = mock(async () => platformAuth);
    replaceMethod(platformBrandingAddonProductService, "get", get);
    replaceMethod(platformBrandingAddonProductService, "update", update);

    try {
      const getResponse = await requiredHandler(
        controller,
        "GET /platform/branding/entitlement-product",
      )({ query: {}, user: { sub: AUTH_USER_ID } } as FastifyRequest, {});
      expect(getResponse).toEqual({
        data: { product: { version: 1 } },
        message: "success",
      });
      expect(get).toHaveBeenCalledWith(platformAuth);

      const patch = {
        amount_fen: 1,
        enabled: true,
        version: 1,
      };
      await requiredHandler(
        controller,
        "PATCH /platform/branding/entitlement-product",
      )({
        body: patch,
        query: {},
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(update).toHaveBeenCalledWith(platformAuth, patch);
    } finally {
      authorizationService.getRequiredAuthContext = originals.auth;
      replaceMethod(platformBrandingAddonProductService, "get", originals.get);
      replaceMethod(
        platformBrandingAddonProductService,
        "update",
        originals.update,
      );
    }
  });

  test("binds create-order payer only from a verified WeChat JWT", async () => {
    const {
      authorizationService,
      controller,
      tenantBrandingAddonOrderService,
    } = await loadHarness();
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      create: tenantBrandingAddonOrderService.createOrder,
    };
    const createOrder = mock(async () => ({ order: { id: ORDER_ID } }));
    authorizationService.getRequiredAuthContext = mock(async () => tenantAuth);
    replaceMethod(tenantBrandingAddonOrderService, "createOrder", createOrder);
    const body = {
      product_code: "custom_support_branding_annual",
      idempotency_key: IDEMPOTENCY_KEY,
    };

    try {
      await requiredHandler(
        controller,
        "POST /tenant/branding/entitlement-orders",
      )({
        body,
        query: {},
        user: {
          sub: AUTH_USER_ID,
          login_channel: "wechat",
          openid: OPENID,
        },
      } as FastifyRequest, {});
      expect(createOrder).toHaveBeenCalledWith(tenantAuth, body, OPENID);

      await expect(requiredHandler(
        controller,
        "POST /tenant/branding/entitlement-orders",
      )({
        body,
        query: {},
        user: {
          sub: AUTH_USER_ID,
          login_channel: "admin_web",
        },
      } as FastifyRequest, {})).rejects.toMatchObject({
        statusCode: 403,
        code: "BRANDING_ADDON_WECHAT_LOGIN_REQUIRED",
      });
      await expect(requiredHandler(
        controller,
        "POST /tenant/branding/entitlement-orders",
      )({
        body,
        query: {},
        user: {
          sub: AUTH_USER_ID,
          login_channel: "wechat",
        },
      } as FastifyRequest, {})).rejects.toMatchObject({
        statusCode: 403,
        code: "BRANDING_ADDON_WECHAT_LOGIN_REQUIRED",
      });
      expect(createOrder).toHaveBeenCalledTimes(1);
    } finally {
      authorizationService.getRequiredAuthContext = originals.auth;
      replaceMethod(
        tenantBrandingAddonOrderService,
        "createOrder",
        originals.create,
      );
    }
  });

  test("binds payment-request payer from JWT and rejects client tenant IDs", async () => {
    const {
      authorizationService,
      controller,
      tenantBrandingAddonOrderService,
    } = await loadHarness();
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      payment: tenantBrandingAddonOrderService.createPaymentRequest,
    };
    const createPaymentRequest = mock(async () => ({
      order: { id: ORDER_ID },
    }));
    authorizationService.getRequiredAuthContext = mock(async () => tenantAuth);
    replaceMethod(
      tenantBrandingAddonOrderService,
      "createPaymentRequest",
      createPaymentRequest,
    );

    try {
      await requiredHandler(
        controller,
        "POST /tenant/branding/entitlement-orders/:id/payment-request",
      )({
        params: { id: ORDER_ID },
        query: {},
        body: {},
        user: {
          sub: AUTH_USER_ID,
          login_channel: "wechat",
          openid: OPENID,
        },
      } as FastifyRequest, {});
      expect(createPaymentRequest).toHaveBeenCalledWith(
        tenantAuth,
        ORDER_ID,
        OPENID,
      );

      await expect(requiredHandler(
        controller,
        "POST /tenant/branding/entitlement-orders/:id/payment-request",
      )({
        params: { id: ORDER_ID },
        query: {},
        body: {},
        user: {
          sub: AUTH_USER_ID,
          login_channel: "admin_web",
        },
      } as FastifyRequest, {})).rejects.toMatchObject({
        statusCode: 403,
        code: "BRANDING_ADDON_WECHAT_LOGIN_REQUIRED",
      });

      await expect(requiredHandler(
        controller,
        "POST /tenant/branding/entitlement-orders/:id/payment-request",
      )({
        params: { id: ORDER_ID },
        query: { tenant_id: TENANT_ID },
        body: {},
        user: {
          sub: AUTH_USER_ID,
          login_channel: "wechat",
          openid: OPENID,
        },
      } as unknown as FastifyRequest, {})).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
      expect(createPaymentRequest).toHaveBeenCalledTimes(1);
    } finally {
      authorizationService.getRequiredAuthContext = originals.auth;
      replaceMethod(
        tenantBrandingAddonOrderService,
        "createPaymentRequest",
        originals.payment,
      );
    }
  });

  test("parses tenant product, list and detail without accepting tenant_id", async () => {
    const {
      authorizationService,
      controller,
      tenantBrandingAddonOrderService,
    } = await loadHarness();
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      product: tenantBrandingAddonOrderService.getProduct,
      list: tenantBrandingAddonOrderService.listOrders,
      detail: tenantBrandingAddonOrderService.getOrder,
    };
    const getProduct = mock(async () => ({ product: { enabled: true } }));
    const listOrders = mock(async () => ({ list: [] }));
    const getOrder = mock(async () => ({ order: { id: ORDER_ID } }));
    authorizationService.getRequiredAuthContext = mock(async () => tenantAuth);
    replaceMethod(tenantBrandingAddonOrderService, "getProduct", getProduct);
    replaceMethod(tenantBrandingAddonOrderService, "listOrders", listOrders);
    replaceMethod(tenantBrandingAddonOrderService, "getOrder", getOrder);

    try {
      await requiredHandler(
        controller,
        "GET /tenant/branding/entitlement-product",
      )({ query: {}, user: { sub: AUTH_USER_ID } } as FastifyRequest, {});
      expect(getProduct).toHaveBeenCalledWith(tenantAuth);

      await requiredHandler(
        controller,
        "GET /tenant/branding/entitlement-orders",
      )({
        query: { page: "2", pageSize: "20", status: "pending" },
        user: { sub: AUTH_USER_ID },
      } as unknown as FastifyRequest, {});
      expect(listOrders).toHaveBeenCalledWith(tenantAuth, {
        page: 2,
        pageSize: 20,
        status: "pending",
      });

      await requiredHandler(
        controller,
        "GET /tenant/branding/entitlement-orders/:id",
      )({
        params: { id: ORDER_ID },
        query: {},
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(getOrder).toHaveBeenCalledWith(tenantAuth, ORDER_ID);

      await expect(requiredHandler(
        controller,
        "GET /tenant/branding/entitlement-orders",
      )({
        query: { tenant_id: TENANT_ID },
        user: { sub: AUTH_USER_ID },
      } as unknown as FastifyRequest, {})).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
      expect(listOrders).toHaveBeenCalledTimes(1);
    } finally {
      authorizationService.getRequiredAuthContext = originals.auth;
      replaceMethod(
        tenantBrandingAddonOrderService,
        "getProduct",
        originals.product,
      );
      replaceMethod(
        tenantBrandingAddonOrderService,
        "listOrders",
        originals.list,
      );
      replaceMethod(
        tenantBrandingAddonOrderService,
        "getOrder",
        originals.detail,
      );
    }
  });

  test("keeps controller boundaries and registers the module once", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const routes = readFileSync(
      new URL("../../routes/index.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("@/repositories/");
    expect(source).not.toContain("@/utils/supabase");
    expect(source).not.toContain(".from(");
    expect(routes).toContain(
      'import BrandingAddonController from "@/controllers/branding-addon";',
    );
    expect(routes).toContain(
      "BrandingAddonController.registerExtraRoutes(app);",
    );
  });
});
