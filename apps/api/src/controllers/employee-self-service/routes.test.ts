import { describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const TRIAL_ID = "20000000-0000-4000-8000-000000000001";
const permissionCodes = [
  "dashboard.read",
  "billing.service_order.create",
] as const;
const authContext = {
  authUserId: "auth-user-1",
  employeeId: "employee-1",
  tenantId: TENANT_ID,
  tenantName: "固始晴天装饰",
  tenantSlug: "qingtian",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["tenant_admin"],
  roles: [],
  permissions: permissionCodes.map((code) => ({ code, scope: "all" as const })),
} satisfies AuthContext;

type RouteHandler = (
  request: FastifyRequest,
  reply: unknown,
) => Promise<{ data: unknown; message: string }>;

type RegisteredRoute = {
  method: string;
  path: string;
  tenantServiceAccess: unknown;
  handler: RouteHandler;
};

async function loadController() {
  const modulePath = `./${"index"}`;
  return (await import(modulePath)).default;
}

function registeredRoutes(controller: {
  registerExtraRoutes(fastify: unknown): void;
}): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  const register = (method: string) => (
    path: string,
    options: { config?: { tenantServiceAccess?: unknown } },
    handler: RouteHandler,
  ) => routes.push({
    method,
    path,
    tenantServiceAccess: options.config?.tenantServiceAccess,
    handler,
  });
  controller.registerExtraRoutes({
    get: register("GET"),
    post: register("POST"),
  });
  return routes;
}

function requiredHandler(routes: RegisteredRoute[], route: string) {
  const found = routes.find(({ method, path }) => `${method} ${path}` === route);
  if (!found) throw new TypeError(`missing route handler: ${route}`);
  return found.handler;
}

function replaceMethod(target: object, method: string, value: unknown) {
  Reflect.set(target, method, value);
}

describe("EmployeeSelfServiceController service access routes", () => {
  test("registers existing and service recovery routes with exact metadata", async () => {
    const routes = registeredRoutes(await loadController());

    expect(routes.map(({ method, path, tenantServiceAccess }) => ({
      method,
      path,
      tenantServiceAccess,
    }))).toEqual([
      {
        method: "GET",
        path: "/employee/bootstrap",
        tenantServiceAccess: "session",
      },
      {
        method: "GET",
        path: "/employee/personalization",
        tenantServiceAccess: "read",
      },
      {
        method: "GET",
        path: "/employee/service-access",
        tenantServiceAccess: "session",
      },
      {
        method: "POST",
        path: "/employee/service-access/purchase-link",
        tenantServiceAccess: "recovery",
      },
    ]);
  });

  test("uses tenant context permissions, ignores untrusted purchase fields, and wraps", async () => {
    const [
      controller,
      { adminTenantServiceAccessService },
      { adminServicePurchaseLinkService },
    ] = await Promise.all([
      loadController(),
      import("@/services/admin-tenant-service-access"),
      import("@/services/admin-service-purchase-link"),
    ]);
    const getRequiredTenantContext = mock(async () => authContext);
    const resolve = mock(async () => ({
      accessStatus: "service_blocked" as const,
      trialId: TRIAL_ID,
    }));
    const create = mock(async () => ({
      url: "https://wxaurl.cn/trusted-link",
      expires_at: "2026-08-19T02:40:00.000Z",
    }));
    const originalContext = Reflect.get(controller, "getRequiredTenantContext");
    const originalResolve = adminTenantServiceAccessService.resolve;
    const originalCreate = adminServicePurchaseLinkService.create;
    replaceMethod(controller, "getRequiredTenantContext", getRequiredTenantContext);
    replaceMethod(adminTenantServiceAccessService, "resolve", resolve);
    replaceMethod(adminServicePurchaseLinkService, "create", create);
    const routes = registeredRoutes(controller);
    const getRequest = { id: "get-service-access" } as FastifyRequest;
    const postRequest = {
      id: "create-purchase-link",
      body: {
        tenantId: "attacker-tenant",
        trialId: "attacker-trial",
        path: "pages/attacker/index",
      },
      user: {
        sub: "auth-user-1",
        tenant_id: "attacker-tenant",
        openid: "attacker-openid",
      },
    } as unknown as FastifyRequest;

    try {
      const serviceAccessResponse = await requiredHandler(
        routes,
        "GET /employee/service-access",
      )(getRequest, {});
      const purchaseLinkResponse = await requiredHandler(
        routes,
        "POST /employee/service-access/purchase-link",
      )(postRequest, {});

      expect(getRequiredTenantContext).toHaveBeenCalledTimes(2);
      expect(getRequiredTenantContext).toHaveBeenNthCalledWith(1, getRequest);
      expect(getRequiredTenantContext).toHaveBeenNthCalledWith(2, postRequest);
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        permissionCodes: [...permissionCodes],
      });
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        permissionCodes: [...permissionCodes],
      });
      expect(serviceAccessResponse).toEqual({
        data: { accessStatus: "service_blocked", trialId: TRIAL_ID },
        message: "success",
      });
      expect(purchaseLinkResponse).toEqual({
        data: {
          url: "https://wxaurl.cn/trusted-link",
          expires_at: "2026-08-19T02:40:00.000Z",
        },
        message: "success",
      });
    } finally {
      replaceMethod(controller, "getRequiredTenantContext", originalContext);
      replaceMethod(adminTenantServiceAccessService, "resolve", originalResolve);
      replaceMethod(adminServicePurchaseLinkService, "create", originalCreate);
    }
  });
});
