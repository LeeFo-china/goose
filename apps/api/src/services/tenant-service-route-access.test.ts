import { describe, expect, test } from "bun:test";

import { TENANT_SERVICE_ROUTE_ACCESS_VALUES } from "@gooes/domain";

describe("tenant service route access reader", () => {
  test("accepts every explicit domain route access value", async () => {
    const {
      getTenantServiceAuthOptions,
      getTenantServiceRouteAccess,
      resolveTenantServiceRouteAccess,
    } = await import("./tenant-service-route-access");

    for (const tenantServiceAccess of TENANT_SERVICE_ROUTE_ACCESS_VALUES) {
      const request = createRequest("POST", tenantServiceAccess);
      expect(resolveTenantServiceRouteAccess(request)).toEqual({
        access: tenantServiceAccess,
        isMissing: false,
      });
      expect(getTenantServiceRouteAccess(request)).toBe(tenantServiceAccess);
      expect(getTenantServiceAuthOptions(request)).toEqual({
        tenantServiceAccess,
        requiredCapability: tenantServiceAccess === "read"
            || tenantServiceAccess === "write"
          ? "core.projects"
          : null,
      });
    }
  });

  test.each([
    ["GET", "read"],
    ["get", "read"],
    ["HEAD", "read"],
    ["POST", "write"],
    ["PATCH", "write"],
    ["DELETE", "write"],
    ["OPTIONS", "write"],
  ] as const)(
    "falls back %s safely while exposing missing metadata",
    async (method, access) => {
      const {
        getTenantServiceRouteAccess,
        resolveTenantServiceRouteAccess,
      } = await import("./tenant-service-route-access");
      const request = createRequest(method, undefined);

      expect(resolveTenantServiceRouteAccess(request)).toEqual({
        access,
        isMissing: true,
      });
      expect(getTenantServiceRouteAccess(request)).toBe(access);
    },
  );

  test.each([null, "", "admin", "READ", 1])(
    "rejects invalid configured access value %# instead of falling back",
    async (tenantServiceAccess) => {
      const { resolveTenantServiceRouteAccess } =
        await import("./tenant-service-route-access");

      const caught = captureThrown(() =>
        resolveTenantServiceRouteAccess(
          createRequest("GET", tenantServiceAccess),
        )
      );
      expect(caught).toMatchObject({
        statusCode: 500,
        code: "TENANT_SERVICE_ROUTE_ACCESS_INVALID",
        message: "路由租户服务访问类别无效",
      });
    },
  );
});

function createRequest(method: string, tenantServiceAccess: unknown) {
  return {
    method,
    routeOptions: {
      url: "/projects/:id",
      config: tenantServiceAccess === undefined
        ? {}
        : { tenantServiceAccess },
    },
  };
}

function captureThrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
}
