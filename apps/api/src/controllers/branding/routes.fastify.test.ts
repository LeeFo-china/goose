import { describe, expect, test } from "bun:test";
import Fastify from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const declaredRoutes = [
  ["GET", "/branding/effective"],
  ["GET", "/platform/branding"],
  ["PATCH", "/platform/branding"],
  ["POST", "/platform/branding/publish"],
  ["GET", "/platform/tenants/:id/entitlements"],
  [
    "POST",
    "/platform/tenants/:id/entitlements/custom_support_branding/grant",
  ],
  [
    "POST",
    "/platform/tenants/:id/entitlements/custom_support_branding/suspend",
  ],
  [
    "POST",
    "/platform/tenants/:id/entitlements/custom_support_branding/resume",
  ],
  [
    "POST",
    "/platform/tenants/:id/entitlements/custom_support_branding/revoke",
  ],
  ["GET", "/tenant/branding"],
  ["PATCH", "/tenant/branding"],
  ["POST", "/tenant/branding/publish"],
] as const;

describe("BrandingController Fastify registration", () => {
  test("readies twelve declared routes with automatic HEAD and no duplicates", async () => {
    const app = Fastify();
    const observed: string[] = [];
    app.addHook("onRoute", (route) => {
      const methods = Array.isArray(route.method)
        ? route.method
        : [route.method];
      for (const method of methods) observed.push(`${method} ${route.url}`);
    });
    const { default: controller } = await import(".");

    try {
      controller.registerExtraRoutes(app);
      await app.ready();

      const expected = declaredRoutes.flatMap(([method, path]) =>
        method === "GET"
          ? [`GET ${path}`, `HEAD ${path}`]
          : [`${method} ${path}`]
      );
      const brandingRoutes = observed.filter((route) =>
        route.includes(" /branding/") ||
        route.includes(" /platform/branding") ||
        route.includes(" /platform/tenants/") ||
        route.includes(" /tenant/branding")
      );
      expect([...brandingRoutes].sort()).toEqual([...expected].sort());
      expect(new Set(brandingRoutes).size).toBe(brandingRoutes.length);

      for (const [method, path] of declaredRoutes) {
        expect(app.hasRoute({ method, url: path })).toBe(true);
        if (method === "GET") {
          expect(app.hasRoute({ method: "HEAD", url: path })).toBe(true);
        }
      }
    } finally {
      await app.close();
    }
  });
});
