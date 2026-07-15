import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("TenantServiceProviderController routes", () => {
  test("registers six tenant profile and area routes", async () => {
    const controller = (await import(".")).default;
    const routes: Array<{ method: string; path: string }> = [];
    controller.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    } as never);
    expect(routes).toEqual([
      { method: "GET", path: "/tenant/service-provider-profile" },
      { method: "PATCH", path: "/tenant/service-provider-profile" },
      { method: "GET", path: "/tenant/service-provider-areas" },
      { method: "POST", path: "/tenant/service-provider-areas" },
      { method: "PATCH", path: "/tenant/service-provider-areas/:id" },
      { method: "POST", path: "/tenant/service-provider-profile/submit" },
    ]);
  });
});
