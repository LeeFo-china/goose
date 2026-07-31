import { describe, expect, mock, test } from "bun:test";

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

const tenantAuth = {
  authUserId: AUTH_USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  tenantName: "测试租户",
  tenantSlug: "test-tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "租户管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["system_admin"],
  roles: [],
  permissions: [{ code: "brand.entitlement.purchase", scope: "all" }],
} satisfies AuthContext;

type RouteResponse = { data: unknown; message: string };
type RouteHandler = (
  request: FastifyRequest,
  reply: unknown,
) => Promise<RouteResponse>;

function requiredHandler(
  controller: { registerExtraRoutes(fastify: unknown): void },
  route: string,
) {
  const routes = new Map<string, RouteHandler>();
  const register = (method: string) =>
    (path: string, handler: RouteHandler) =>
      routes.set(`${method} ${path}`, handler);
  controller.registerExtraRoutes({
    get: register("GET"),
    patch: register("PATCH"),
    post: register("POST"),
  });
  const handler = routes.get(route);
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

describe("BrandingAddonController virtual payment routes", () => {
  test("binds virtual-order identity to tenant auth and verified WeChat JWT", async () => {
    const [
      { default: controller },
      { authorizationService },
      { tenantBrandingVirtualOrderService },
    ] = await Promise.all([
      import("."),
      import("@/services/authorization"),
      import("@/services/tenant-branding-virtual-orders"),
    ]);
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      create: tenantBrandingVirtualOrderService.createOrder,
      payment: tenantBrandingVirtualOrderService.createPaymentRequest,
    };
    const createOrder = mock(async () => ({ order: { id: ORDER_ID } }));
    const createPaymentRequest = mock(async () => ({
      order: { id: ORDER_ID },
      payment_request: { kind: "wechat_virtual" },
    }));
    authorizationService.getRequiredAuthContext = mock(async () => tenantAuth);
    replaceMethod(tenantBrandingVirtualOrderService, "createOrder", createOrder);
    replaceMethod(
      tenantBrandingVirtualOrderService,
      "createPaymentRequest",
      createPaymentRequest,
    );
    const body = {
      product_code: "custom_support_branding_annual",
      idempotency_key: IDEMPOTENCY_KEY,
      requested_platform: "ios",
    };

    try {
      await requiredHandler(
        controller,
        "POST /tenant/branding/virtual-payment/orders",
      )({
        body,
        query: {},
        user: { sub: AUTH_USER_ID, login_channel: "wechat", openid: OPENID },
      } as FastifyRequest, {});
      expect(createOrder).toHaveBeenCalledWith(tenantAuth, body, OPENID);

      await requiredHandler(
        controller,
        "POST /tenant/branding/virtual-payment/orders/:id/payment-request",
      )({
        params: { id: ORDER_ID },
        query: {},
        body: {},
        user: { sub: AUTH_USER_ID, login_channel: "wechat", openid: OPENID },
      } as FastifyRequest, {});
      expect(createPaymentRequest).toHaveBeenCalledWith(
        tenantAuth,
        ORDER_ID,
        OPENID,
      );

      await expect(requiredHandler(
        controller,
        "POST /tenant/branding/virtual-payment/orders",
      )({
        body,
        query: {},
        user: { sub: AUTH_USER_ID, login_channel: "admin_web" },
      } as FastifyRequest, {})).rejects.toMatchObject({
        statusCode: 403,
        code: "BRANDING_ADDON_WECHAT_LOGIN_REQUIRED",
      });

      for (const forged of [
        { amount_fen: 1 },
        { environment: "sandbox" },
        { offer_id: "forged" },
        { provider_product_id: "forged" },
        { payer_openid: "forged" },
        { tenant_id: TENANT_ID },
        { appKey: "forged" },
      ]) {
        await expect(requiredHandler(
          controller,
          "POST /tenant/branding/virtual-payment/orders",
        )({
          body: { ...body, ...forged },
          query: {},
          user: { sub: AUTH_USER_ID, login_channel: "wechat", openid: OPENID },
        } as FastifyRequest, {})).rejects.toMatchObject({
          code: "VALIDATION_ERROR",
        });
      }
      expect(createOrder).toHaveBeenCalledTimes(1);
    } finally {
      authorizationService.getRequiredAuthContext = originals.auth;
      replaceMethod(tenantBrandingVirtualOrderService, "createOrder", originals.create);
      replaceMethod(
        tenantBrandingVirtualOrderService,
        "createPaymentRequest",
        originals.payment,
      );
    }
  });
});
