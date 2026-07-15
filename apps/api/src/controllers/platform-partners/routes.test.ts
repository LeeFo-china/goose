import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformPartnersController routes", () => {
  async function registeredRoutes() {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
    };

    controller.registerExtraRoutes(fastify as never);
    return routes;
  }

  test("registers partner, invite code, and tenant binding routes", async () => {
    const routes = await registeredRoutes();

    expect(routes).toEqual([
      { method: "GET", path: "/partner-onboarding/invite-codes/:code" },
      { method: "POST", path: "/partner-onboarding/tenant-binding" },
      { method: "POST", path: "/partner-onboarding/tenant-applications/send-code" },
      { method: "POST", path: "/partner-onboarding/tenant-applications" },
      { method: "GET", path: "/platform/partners" },
      { method: "POST", path: "/platform/partners" },
      { method: "GET", path: "/platform/partners/levels" },
      { method: "GET", path: "/platform/partners/:id" },
      { method: "PATCH", path: "/platform/partners/:id" },
      { method: "PATCH", path: "/platform/partners/:id/status" },
      { method: "GET", path: "/platform/partners/:id/members" },
      { method: "POST", path: "/platform/partners/:id/members" },
      { method: "PATCH", path: "/platform/partner-members/:memberId/status" },
      { method: "POST", path: "/platform/partners/:id/invite-codes" },
      { method: "GET", path: "/platform/partners/:id/invite-codes" },
      { method: "GET", path: "/platform/partner-invite-codes/:code/qrcode" },
      { method: "GET", path: "/platform/partner-bindings" },
      { method: "POST", path: "/platform/partner-bindings" },
    ]);
  });

  test("keeps legacy tenant application routes separate from the new submitted-application API", async () => {
    const routes = await registeredRoutes();

    expect(routes).toContainEqual({
      method: "POST",
      path: "/partner-onboarding/tenant-applications/send-code",
    });
    expect(routes).toContainEqual({
      method: "POST",
      path: "/partner-onboarding/tenant-applications",
    });
    expect(routes).not.toContainEqual({
      method: "POST",
      path: "/tenant-onboarding/applications",
    });
  });
});
