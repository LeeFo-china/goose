import { describe, expect, mock, test } from "bun:test";

import type { FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";
import { mockPlatformPermission } from "./routes-platform-auth-test-helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_USER_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";

const platformAuth: AuthContext = {
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
  permissions: [{ code: "platform.branding_order.read", scope: "all" }],
};

type RouteHandler = (
  request: FastifyRequest,
  reply: unknown,
) => Promise<unknown>;

async function loadHarness() {
  const [
    { default: controller },
    { authorizationService },
    { platformAuthorizationService },
    { platformBrandingAddonOrdersService },
  ] = await Promise.all([
    import("."),
    import("@/services/authorization"),
    import("@/services/platform-authorization"),
    import("@/services/platform-branding-addon-orders"),
  ]);
  return {
    controller,
    authorizationService,
    platformAuthorizationService,
    platformBrandingAddonOrdersService,
  };
}

function requiredHandler(
  controller: { registerExtraRoutes(app: unknown): void },
  route: string,
): RouteHandler {
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

describe("BrandingAddonController platform order routes", () => {
  test("parses filters and delegates detail with platform auth", async () => {
    const {
      authorizationService,
      controller,
      platformAuthorizationService,
      platformBrandingAddonOrdersService,
    } = await loadHarness();
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      list: platformBrandingAddonOrdersService.list,
      detail: platformBrandingAddonOrdersService.get,
    };
    const restorePlatformPermission = mockPlatformPermission(
      platformAuthorizationService,
      platformAuth,
    );
    const list = mock(async () => ({
      list: [],
      pagination: { page: 2, pageSize: 100, total: 0, totalPages: 0 },
    }));
    const detail = mock(async () => ({ order: { id: ORDER_ID } }));
    authorizationService.getRequiredAuthContext = mock(async () => platformAuth);
    replaceMethod(platformBrandingAddonOrdersService, "list", list);
    replaceMethod(platformBrandingAddonOrdersService, "get", detail);

    try {
      const query = {
        page: "2",
        pageSize: "100",
        tenant_id: TENANT_ID,
        status: "paid",
        keyword: "BA20260728",
        created_from: "2026-07-01T00:00:00.000Z",
        created_to: "2026-07-31T23:59:59.999Z",
      };
      await requiredHandler(
        controller,
        "GET /platform/branding/entitlement-orders",
      )({
        query,
        user: { sub: AUTH_USER_ID },
      } as unknown as FastifyRequest, {});
      expect(list).toHaveBeenCalledWith(platformAuth, {
        ...query,
        page: 2,
        pageSize: 100,
      });

      await requiredHandler(
        controller,
        "GET /platform/branding/entitlement-orders/:id",
      )({
        params: { id: ORDER_ID },
        query: {},
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(detail).toHaveBeenCalledWith(platformAuth, ORDER_ID);
    } finally {
      restorePlatformPermission();
      authorizationService.getRequiredAuthContext = originals.auth;
      replaceMethod(platformBrandingAddonOrdersService, "list", originals.list);
      replaceMethod(
        platformBrandingAddonOrdersService,
        "get",
        originals.detail,
      );
    }
  });

  test("rejects invalid pagination before calling the service", async () => {
    const {
      authorizationService,
      controller,
      platformAuthorizationService,
      platformBrandingAddonOrdersService,
    } = await loadHarness();
    const originalAuth = authorizationService.getRequiredAuthContext;
    const originalList = platformBrandingAddonOrdersService.list;
    const restorePlatformPermission = mockPlatformPermission(
      platformAuthorizationService,
      platformAuth,
    );
    const list = mock(async () => ({ list: [] }));
    authorizationService.getRequiredAuthContext = mock(async () => platformAuth);
    replaceMethod(platformBrandingAddonOrdersService, "list", list);

    try {
      await expect(requiredHandler(
        controller,
        "GET /platform/branding/entitlement-orders",
      )({
        query: { pageSize: "101" },
        user: { sub: AUTH_USER_ID },
      } as unknown as FastifyRequest, {})).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
      expect(list).not.toHaveBeenCalled();
    } finally {
      restorePlatformPermission();
      authorizationService.getRequiredAuthContext = originalAuth;
      replaceMethod(platformBrandingAddonOrdersService, "list", originalList);
    }
  });
});
