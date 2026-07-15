import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PhoneIdentityLoginController routes", () => {
  test("registers unified phone identity login routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      post: (path: string) => routes.push({ method: "POST", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "POST", path: "/auth/phone-login/send-code" },
      { method: "POST", path: "/auth/phone-login/verify" },
      { method: "POST", path: "/auth/phone-login/select" },
    ]);
  });
});
