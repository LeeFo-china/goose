import { describe, expect, test } from "bun:test";

import {
  isPartnerPortalRoute,
  isPublicRoute,
  isVisitorSessionRoute,
} from "@/plugins/auth/legacy/routes";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PartnerOnboardingApplicationsController routes", () => {
  test("registers the three partner assist routes", async () => {
    const module = await import(".").catch(() => null);
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    };

    module?.default.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/partner/onboarding-applications" },
      { method: "GET", path: "/partner/onboarding-applications/:id" },
      {
        method: "POST",
        path: "/partner/onboarding-applications/:id/assist-review",
      },
    ]);
  });

  test("classifies assist routes only as protected partner portal routes", () => {
    const id = "00000000-0000-4000-8000-000000000501";
    const routes = [
      ["GET", "/partner/onboarding-applications"],
      ["HEAD", "/partner/onboarding-applications"],
      ["GET", `/partner/onboarding-applications/${id}`],
      ["HEAD", `/partner/onboarding-applications/${id}`],
      ["POST", `/partner/onboarding-applications/${id}/assist-review`],
    ] as const;

    for (const [method, path] of routes) {
      expect(isPartnerPortalRoute(method, path)).toBe(true);
      expect(isPublicRoute(method, path)).toBe(false);
      expect(isVisitorSessionRoute(method, path)).toBe(false);
    }
  });
});
