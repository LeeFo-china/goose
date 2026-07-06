import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformPartnerApplicationsController routes", () => {
  test("registers public application and platform review routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "POST", path: "/public/partner-applications/send-code" },
      { method: "POST", path: "/public/partner-applications" },
      { method: "GET", path: "/platform/partner-applications" },
      { method: "GET", path: "/platform/partner-applications/:id" },
      { method: "PATCH", path: "/platform/partner-applications/:id/status" },
      { method: "POST", path: "/platform/partner-applications/:id/approve" },
    ]);
  });
});
