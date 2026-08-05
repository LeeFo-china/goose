import { describe, expect, mock, test } from "bun:test";

import type { FastifyRequest } from "fastify";
import type { PlatformStaffAuthContext } from "@/services/platform-authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const OPERATOR_ID = "44444444-4444-4444-8444-444444444444";
const ROLE_ID = "33333333-3333-4333-8333-333333333333";
const IDEMPOTENCY_KEY = "55555555-5555-4555-8555-555555555555";

const platformAuth = {
  authUserId: AUTH_USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  isPlatformStaff: true,
  isPlatformSuperAdmin: true,
  adminAuthVersion: 1,
  employeeName: "平台超管",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin", "platform_staff"],
  roles: [],
  permissions: [
    { code: "platform.operator.read", scope: "all" as const },
    { code: "platform.operator.manage", scope: "all" as const },
  ],
} satisfies PlatformStaffAuthContext;

type RouteResponse = { data: unknown; message: string };
type RouteHandler = (
  request: FastifyRequest,
  reply: unknown,
) => Promise<RouteResponse>;

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
    put: register("PUT"),
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

describe("PlatformOperatorsController routes", () => {
  test("registers platform operator routes", async () => {
    const { default: controller } = await import(".");

    expect([...registeredHandlers(controller).keys()]).toEqual([
      "GET /platform/operators",
      "POST /platform/operators",
      "GET /platform/operators/:id",
      "PATCH /platform/operators/:id",
      "PUT /platform/operators/:id/roles",
      "POST /platform/operators/:id/activate",
      "POST /platform/operators/:id/suspend",
      "POST /platform/operators/:id/leave",
      "POST /platform/operators/:id/revoke-sessions",
    ]);
  });

  test("authenticates, validates, delegates, and wraps responses", async () => {
    const [{ default: controller }, { platformOperatorsService }] =
      await Promise.all([
        import("."),
        import("@/services/platform-operators"),
      ]);
    const originals = {
      readAuth: Reflect.get(controller, "getRequiredPlatformPermissionContext"),
      superAuth: Reflect.get(controller, "getRequiredPlatformSuperAdminContext"),
      list: platformOperatorsService.list,
      create: platformOperatorsService.create,
      getById: platformOperatorsService.getById,
      update: platformOperatorsService.update,
      replaceRoles: platformOperatorsService.replaceRoles,
      transitionStatus: platformOperatorsService.transitionStatus,
      revokeSessions: platformOperatorsService.revokeSessions,
    };
    const list = mock(async () => ({ list: [], pagination: { total: 0 } }));
    const create = mock(async () => ({ id: OPERATOR_ID }));
    const getById = mock(async () => ({ id: OPERATOR_ID }));
    const update = mock(async () => ({ id: OPERATOR_ID, version: 2 }));
    const replaceRoles = mock(async () => ({ id: OPERATOR_ID, version: 3 }));
    const transitionStatus = mock(async () => ({ id: OPERATOR_ID, status: "active" }));
    const revokeSessions = mock(async () => ({ id: OPERATOR_ID, admin_auth_version: 2 }));
    replaceMethod(
      controller,
      "getRequiredPlatformPermissionContext",
      mock(async () => platformAuth),
    );
    replaceMethod(
      controller,
      "getRequiredPlatformSuperAdminContext",
      mock(async () => platformAuth),
    );
    replaceMethod(platformOperatorsService, "list", list);
    replaceMethod(platformOperatorsService, "create", create);
    replaceMethod(platformOperatorsService, "getById", getById);
    replaceMethod(platformOperatorsService, "update", update);
    replaceMethod(platformOperatorsService, "replaceRoles", replaceRoles);
    replaceMethod(platformOperatorsService, "transitionStatus", transitionStatus);
    replaceMethod(platformOperatorsService, "revokeSessions", revokeSessions);

    try {
      const listResponse = await requiredHandler(
        controller,
        "GET /platform/operators",
      )({
        query: { page: "2", pageSize: "10", keyword: "张" },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(listResponse).toEqual({
        data: { list: [], pagination: { total: 0 } },
        message: "success",
      });
      expect(list).toHaveBeenCalledWith(platformAuth, {
        page: 2,
        pageSize: 10,
        keyword: "张",
      });

      await requiredHandler(controller, "POST /platform/operators")({
        body: {
          name: "新人员",
          phone: "13900139000",
          role_ids: [ROLE_ID],
          idempotency_key: IDEMPOTENCY_KEY,
        },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(create).toHaveBeenCalledWith(platformAuth, {
        name: "新人员",
        phone: "13900139000",
        role_ids: [ROLE_ID],
        status: "pending",
        idempotency_key: IDEMPOTENCY_KEY,
      });

      await requiredHandler(controller, "GET /platform/operators/:id")({
        params: { id: OPERATOR_ID },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(getById).toHaveBeenCalledWith(platformAuth, OPERATOR_ID);

      await requiredHandler(controller, "PATCH /platform/operators/:id")({
        params: { id: OPERATOR_ID },
        body: {
          name: "新名字",
          expected_version: 1,
          idempotency_key: IDEMPOTENCY_KEY,
        },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(update).toHaveBeenCalledWith(platformAuth, OPERATOR_ID, {
        name: "新名字",
        expected_version: 1,
        idempotency_key: IDEMPOTENCY_KEY,
      });

      await requiredHandler(controller, "PUT /platform/operators/:id/roles")({
        params: { id: OPERATOR_ID },
        body: {
          role_ids: [ROLE_ID],
          expected_version: 2,
          idempotency_key: IDEMPOTENCY_KEY,
        },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(replaceRoles).toHaveBeenCalledWith(platformAuth, OPERATOR_ID, {
        role_ids: [ROLE_ID],
        expected_version: 2,
        idempotency_key: IDEMPOTENCY_KEY,
      });

      await requiredHandler(controller, "POST /platform/operators/:id/suspend")({
        params: { id: OPERATOR_ID },
        body: {
          expected_version: 3,
          idempotency_key: IDEMPOTENCY_KEY,
        },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(transitionStatus).toHaveBeenCalledWith(
        platformAuth,
        OPERATOR_ID,
        "suspended",
        { expected_version: 3, idempotency_key: IDEMPOTENCY_KEY },
      );

      await requiredHandler(
        controller,
        "POST /platform/operators/:id/revoke-sessions",
      )({
        params: { id: OPERATOR_ID },
        body: {
          expected_version: 4,
          idempotency_key: IDEMPOTENCY_KEY,
        },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(revokeSessions).toHaveBeenCalledWith(platformAuth, OPERATOR_ID, {
        expected_version: 4,
        idempotency_key: IDEMPOTENCY_KEY,
      });
    } finally {
      replaceMethod(
        controller,
        "getRequiredPlatformPermissionContext",
        originals.readAuth,
      );
      replaceMethod(
        controller,
        "getRequiredPlatformSuperAdminContext",
        originals.superAuth,
      );
      replaceMethod(platformOperatorsService, "list", originals.list);
      replaceMethod(platformOperatorsService, "create", originals.create);
      replaceMethod(platformOperatorsService, "getById", originals.getById);
      replaceMethod(platformOperatorsService, "update", originals.update);
      replaceMethod(platformOperatorsService, "replaceRoles", originals.replaceRoles);
      replaceMethod(
        platformOperatorsService,
        "transitionStatus",
        originals.transitionStatus,
      );
      replaceMethod(
        platformOperatorsService,
        "revokeSessions",
        originals.revokeSessions,
      );
    }
  });
});
