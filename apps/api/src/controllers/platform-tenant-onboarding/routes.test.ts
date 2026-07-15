import { describe, expect, test } from "bun:test";
import {
  isPartnerPortalRoute,
  isPublicRoute,
  isVisitorSessionRoute,
} from "@/plugins/auth/legacy/routes";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformTenantOnboardingController routes", () => {
  test("registers platform review and service-provider publication routes", async () => {
    const module = await import(".").catch(() => null);
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    };

    module?.default.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/platform/tenant-onboarding/applications" },
      { method: "GET", path: "/platform/tenant-onboarding/applications/:id" },
      { method: "GET", path: "/platform/tenant-onboarding/applications/:id/reviews" },
      { method: "GET", path: "/platform/tenant-onboarding/applications/:id/notifications" },
      { method: "POST", path: "/platform/tenant-onboarding/applications/:id/license-access" },
      { method: "POST", path: "/platform/tenant-onboarding/applications/:id/notifications/:deliveryId/retry" },
      { method: "POST", path: "/platform/tenant-onboarding/applications/:id/start-review" },
      { method: "POST", path: "/platform/tenant-onboarding/applications/:id/request-partner-assist" },
      { method: "POST", path: "/platform/tenant-onboarding/applications/:id/request-supplement" },
      { method: "POST", path: "/platform/tenant-onboarding/applications/:id/approve" },
      { method: "POST", path: "/platform/tenant-onboarding/applications/:id/reject" },
      { method: "GET", path: "/platform/service-provider-publications" },
      { method: "GET", path: "/platform/service-provider-publications/:tenantId" },
      { method: "GET", path: "/platform/service-provider-publications/:tenantId/areas" },
      { method: "POST", path: "/platform/service-provider-publications/:tenantId/publish" },
      { method: "POST", path: "/platform/service-provider-publications/:tenantId/return-draft" },
      { method: "POST", path: "/platform/service-provider-publications/:tenantId/suspend" },
    ]);
  });

  test("keeps every platform review route out of public and scoped tokens", () => {
    const routes = [
      ["GET", "/platform/tenant-onboarding/applications"],
      ["GET", `/platform/tenant-onboarding/applications/${crypto.randomUUID()}`],
      ["POST", `/platform/tenant-onboarding/applications/${crypto.randomUUID()}/approve`],
      ["POST", `/platform/tenant-onboarding/applications/${crypto.randomUUID()}/license-access`],
      ["GET", "/platform/service-provider-publications"],
      ["POST", `/platform/service-provider-publications/${crypto.randomUUID()}/publish`],
    ] as const;
    for (const [method, path] of routes) {
      expect(isPublicRoute(method, path)).toBe(false);
      expect(isVisitorSessionRoute(method, path)).toBe(false);
      expect(isPartnerPortalRoute(method, path)).toBe(false);
    }
  });
});
