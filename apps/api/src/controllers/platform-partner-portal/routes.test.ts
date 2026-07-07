import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformPartnerPortalController routes", () => {
  test("registers partner auth routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "POST", path: "/partner/auth/login" },
      { method: "POST", path: "/partner/auth/send-code" },
      { method: "POST", path: "/partner/auth/bind-phone" },
      { method: "POST", path: "/partner/auth/unbind-code" },
      { method: "POST", path: "/partner/auth/unbind-wechat" },
      { method: "GET", path: "/partner/auth/me" },
      { method: "GET", path: "/partner/dashboard/summary" },
      { method: "GET", path: "/partner/invite-codes" },
      { method: "GET", path: "/partner/dashboard/tenants" },
      { method: "GET", path: "/partner/dashboard/revenue-events" },
      { method: "GET", path: "/partner/dashboard/commission-ledger" },
      { method: "GET", path: "/partner/dashboard/settlements" },
    ]);
  });
});
