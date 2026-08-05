import { describe, expect, mock, test } from "bun:test";

import type { FastifyRequest } from "fastify";
import type { PlatformStaffAuthContext } from "@/services/platform-authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const ROLE_ID = "33333333-3333-4333-8333-333333333333";
const PERMISSION_ID = "44444444-4444-4444-8444-444444444444";
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
    { code: "platform.role.read", scope: "all" as const },
    { code: "platform.role.manage", scope: "all" as const },
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

describe("PlatformRolesController routes", () => {
  test("registers platform role routes", async () => {
    const { default: controller } = await import(".");

    expect([...registeredHandlers(controller).keys()]).toEqual([
      "GET /platform/roles",
      "POST /platform/roles",
      "GET /platform/roles/:id",
      "PATCH /platform/roles/:id",
      "PUT /platform/roles/:id/permissions",
      "POST /platform/roles/:id/archive",
      "GET /platform/permissions",
    ]);
  });

  test("authenticates, validates, delegates, and wraps responses", async () => {
    const [{ default: controller }, { platformRolesService }] =
      await Promise.all([
        import("."),
        import("@/services/platform-roles"),
      ]);
    const originals = {
      readAuth: Reflect.get(controller, "getRequiredPlatformPermissionContext"),
      superAuth: Reflect.get(controller, "getRequiredPlatformSuperAdminContext"),
      listRoles: platformRolesService.listRoles,
      create: platformRolesService.create,
      getById: platformRolesService.getById,
      update: platformRolesService.update,
      replacePermissions: platformRolesService.replacePermissions,
      archive: platformRolesService.archive,
      listPermissions: platformRolesService.listPermissions,
    };
    const listRoles = mock(async () => ({ list: [], pagination: { total: 0 } }));
    const create = mock(async () => ({ id: ROLE_ID }));
    const getById = mock(async () => ({ id: ROLE_ID }));
    const update = mock(async () => ({ id: ROLE_ID, version: 2 }));
    const replacePermissions = mock(async () => ({ id: ROLE_ID, version: 3 }));
    const archive = mock(async () => ({ id: ROLE_ID, status: "inactive" }));
    const listPermissions = mock(async () => ({
      list: [],
      pagination: { total: 0 },
    }));
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
    replaceMethod(platformRolesService, "listRoles", listRoles);
    replaceMethod(platformRolesService, "create", create);
    replaceMethod(platformRolesService, "getById", getById);
    replaceMethod(platformRolesService, "update", update);
    replaceMethod(platformRolesService, "replacePermissions", replacePermissions);
    replaceMethod(platformRolesService, "archive", archive);
    replaceMethod(platformRolesService, "listPermissions", listPermissions);

    try {
      await requiredHandler(controller, "GET /platform/roles")({
        query: { page: "2", pageSize: "10", keyword: "运营" },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(listRoles).toHaveBeenCalledWith(platformAuth, {
        page: 2,
        pageSize: 10,
        keyword: "运营",
      });

      await requiredHandler(controller, "POST /platform/roles")({
        body: {
          name: "新角色",
          description: "",
          permission_ids: [PERMISSION_ID],
          idempotency_key: IDEMPOTENCY_KEY,
        },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(create).toHaveBeenCalledWith(platformAuth, {
        name: "新角色",
        description: "",
        permission_ids: [PERMISSION_ID],
        idempotency_key: IDEMPOTENCY_KEY,
      });

      await requiredHandler(controller, "GET /platform/roles/:id")({
        params: { id: ROLE_ID },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(getById).toHaveBeenCalledWith(platformAuth, ROLE_ID);

      await requiredHandler(controller, "PATCH /platform/roles/:id")({
        params: { id: ROLE_ID },
        body: {
          name: "新角色名",
          expected_version: 2,
          idempotency_key: IDEMPOTENCY_KEY,
        },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(update).toHaveBeenCalledWith(platformAuth, ROLE_ID, {
        name: "新角色名",
        expected_version: 2,
        idempotency_key: IDEMPOTENCY_KEY,
      });

      await requiredHandler(controller, "PUT /platform/roles/:id/permissions")({
        params: { id: ROLE_ID },
        body: {
          permissions: [
            {
              permission_id: PERMISSION_ID,
              access_scope: "all",
            },
          ],
          expected_version: 3,
          idempotency_key: IDEMPOTENCY_KEY,
        },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(replacePermissions).toHaveBeenCalledWith(platformAuth, ROLE_ID, {
        permissions: [{ permission_id: PERMISSION_ID, access_scope: "all" }],
        expected_version: 3,
        idempotency_key: IDEMPOTENCY_KEY,
      });

      await requiredHandler(controller, "POST /platform/roles/:id/archive")({
        params: { id: ROLE_ID },
        body: {
          expected_version: 4,
          idempotency_key: IDEMPOTENCY_KEY,
        },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(archive).toHaveBeenCalledWith(platformAuth, ROLE_ID, {
        expected_version: 4,
        idempotency_key: IDEMPOTENCY_KEY,
      });

      await requiredHandler(controller, "GET /platform/permissions")({
        query: { page: "1", pageSize: "20" },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(listPermissions).toHaveBeenCalledWith(platformAuth, {
        page: 1,
        pageSize: 20,
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
      replaceMethod(platformRolesService, "listRoles", originals.listRoles);
      replaceMethod(platformRolesService, "create", originals.create);
      replaceMethod(platformRolesService, "getById", originals.getById);
      replaceMethod(platformRolesService, "update", originals.update);
      replaceMethod(
        platformRolesService,
        "replacePermissions",
        originals.replacePermissions,
      );
      replaceMethod(platformRolesService, "archive", originals.archive);
      replaceMethod(
        platformRolesService,
        "listPermissions",
        originals.listPermissions,
      );
    }
  });
});
