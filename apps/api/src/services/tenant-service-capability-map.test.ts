import { describe, expect, test } from "bun:test";
import Fastify from "fastify";

import type { TenantServiceRouteAccess } from "@gooes/domain";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type InventoryRoute = {
  method: string;
  url: string;
  access: TenantServiceRouteAccess;
};

describe("tenant service capability map", () => {
  test("maps the six v1 business route families and excludes recovery surfaces", async () => {
    const { resolveTenantServiceRouteCapability } = await import(
      "./tenant-service-capability-map"
    );

    expect(resolveTenantServiceRouteCapability(route("GET", "/projects/:id", "read")))
      .toEqual({ kind: "capability", capability: "core.projects" });
    expect(resolveTenantServiceRouteCapability(route("GET", "/project-cameras", "read")))
      .toEqual({ kind: "capability", capability: "core.projects" });
    expect(resolveTenantServiceRouteCapability(route("GET", "/customer/projects", "read")))
      .toEqual({ kind: "capability", capability: "core.projects" });
    expect(resolveTenantServiceRouteCapability(route("GET", "/tenant-owner/daily-dashboard", "read")))
      .toEqual({ kind: "capability", capability: "core.projects" });
    expect(resolveTenantServiceRouteCapability(route("POST", "/customers", "write")))
      .toEqual({ kind: "capability", capability: "core.customers" });
    expect(resolveTenantServiceRouteCapability(route("GET", "/employees", "read")))
      .toEqual({ kind: "capability", capability: "core.employees" });
    expect(resolveTenantServiceRouteCapability(route("POST", "/workflows", "write")))
      .toEqual({ kind: "capability", capability: "core.workflows" });
    expect(resolveTenantServiceRouteCapability(route("GET", "/uploads/files/:id/preview", "read")))
      .toEqual({ kind: "capability", capability: "core.files" });
    expect(resolveTenantServiceRouteCapability(route("GET", "/notifications", "read")))
      .toEqual({ kind: "capability", capability: "core.notifications" });
    expect(resolveTenantServiceRouteCapability(
      route("POST", "/billing/service-trials/applications", "recovery"),
    )).toEqual({ kind: "excluded", reason: "route_access" });
    expect(resolveTenantServiceRouteCapability(
      route("GET", "/auth/me/permissions", "session"),
    )).toEqual({ kind: "excluded", reason: "route_access" });
  });

  test("explicitly excludes platform, config, payment, and independent add-ons", async () => {
    const { resolveTenantServiceRouteCapability } = await import(
      "./tenant-service-capability-map"
    );

    for (const input of [
      route("GET", "/platform/system-settings", "read"),
      route("PATCH", "/tenant/system-settings/:key", "write"),
      route("POST", "/payments", "write"),
      route("POST", "/tenant/branding/entitlement-orders", "write"),
      route("GET", "/supplier-products", "read"),
    ]) {
      expect(resolveTenantServiceRouteCapability(input)).toMatchObject({
        kind: "excluded",
      });
    }
  });

  test.each([
    ["GET", "/supplier-purchase-batch-project-options", "read"],
    ["GET", "/supplier-purchase-batch-cost-categories", "read"],
    ["GET", "/supplier-purchase-batch-catalog", "read"],
    ["GET", "/supplier-purchase-batches", "read"],
    ["POST", "/supplier-purchase-batches/:id/withdraw", "write"],
    ["POST", "/workflow-tasks/:id/complete", "write"],
    ["POST", "/supplier-purchasable-products/:id", "write"],
  ] as const)("excludes supplier procurement route %s %s from trial capabilities", async (
    method,
    url,
    access,
  ) => {
    const { resolveTenantServiceRouteCapability } = await import(
      "./tenant-service-capability-map"
    );

    const expected = url.startsWith("/workflow-tasks")
      ? { kind: "capability", capability: "core.workflows" } as const
      : { kind: "excluded", reason: "not_trial_capability" } as const;
    expect(resolveTenantServiceRouteCapability(route(method, url, access)))
      .toEqual(expected);
  });

  test("classifies every registered read/write route exactly once", async () => {
    const { default: routes } = await import("@/routes");
    const { matchTenantServiceRouteCapabilityRules } = await import(
      "./tenant-service-capability-map"
    );
    const app = Fastify();
    const inventory: InventoryRoute[] = [];
    app.addHook("onRoute", (registered) => {
      const access = registered.config?.tenantServiceAccess;
      if (access !== "read" && access !== "write") return;
      const methods = Array.isArray(registered.method)
        ? registered.method
        : [registered.method];
      for (const method of methods) {
        inventory.push({ method, url: registered.url, access });
      }
    });

    try {
      await app.register(routes);
      await app.ready();
      const unique = [...new Map(inventory.map((item) => [
        `${item.method} ${item.url}`,
        item,
      ])).values()].filter(isTenantEmployeeGuardedRoute);
      const invalid = unique.map((item) => ({
        route: `${item.method} ${item.url}`,
        matches: matchTenantServiceRouteCapabilityRules(item),
      })).filter((item) => item.matches.length !== 1);

      expect(invalid).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("fails closed for unmapped and ambiguous tenant routes", async () => {
    const {
      resolveTenantServiceRouteCapability,
      resolveTenantServiceRouteCapabilityFromRules,
    } = await import("./tenant-service-capability-map");

    expect(() => resolveTenantServiceRouteCapability(
      route("POST", "/new-tenant-feature", "write"),
    )).toThrow("租户服务路由未映射能力");
    expect(() => resolveTenantServiceRouteCapabilityFromRules(
      route("GET", "/projects", "read"),
      [
        { id: "a", kind: "capability", capability: "core.projects", pattern: /^\/projects/ },
        { id: "b", kind: "capability", capability: "core.files", pattern: /^\/projects/ },
      ],
    )).toThrow("租户服务路由能力映射冲突");
  });
});

function route(
  method: string,
  url: string,
  access: TenantServiceRouteAccess,
): InventoryRoute {
  return { method, url, access };
}

function isTenantEmployeeGuardedRoute(route: InventoryRoute) {
  return !/^\/(?:admin|internal|platform)(?:\/|$)/.test(route.url);
}
