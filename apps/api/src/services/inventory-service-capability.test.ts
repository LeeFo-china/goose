import { describe, expect, test } from "bun:test";

import { resolveTenantServiceRouteCapability } from "./tenant-service-capability-map";
import { getTenantServiceAuthOptions } from "./tenant-service-route-access";

describe("inventory tenant service capability", () => {
  test.each([
    ["GET", "/inventory/balances"],
    ["HEAD", "/inventory/balances"],
    ["GET", "/inventory/transactions"],
    ["HEAD", "/inventory/transactions"],
  ])("classifies %s %s without bypassing read service access", (method, url) => {
    expect(resolveTenantServiceRouteCapability({ method, url, access: "read" }))
      .toEqual({ kind: "excluded", reason: "not_trial_capability" });
    expect(getTenantServiceAuthOptions({
      method,
      routeOptions: { url, config: { tenantServiceAccess: "read" } },
    })).toEqual({ tenantServiceAccess: "read", requiredCapability: null });
  });

  test("keeps unknown inventory-prefixed routes closed", () => {
    expect(() => resolveTenantServiceRouteCapability({
      method: "GET", url: "/inventory-unmapped", access: "read",
    })).toThrow("租户服务路由未映射能力");
  });
});
