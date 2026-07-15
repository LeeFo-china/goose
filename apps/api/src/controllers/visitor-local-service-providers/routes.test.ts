import { describe, expect, test } from "bun:test";
import { isPublicRoute, isVisitorSessionRoute } from "@/plugins/auth/legacy/routes";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("VisitorLocalServiceProvidersController routes", () => {
  test("registers a visitor-only paginated route", async () => {
    const controller = (await import(".")).default;
    const routes: Array<{ method: string; path: string }> = [];
    controller.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
    } as never);
    expect(routes).toEqual([
      { method: "GET", path: "/visitor/local-service-providers" },
    ]);
    expect(isVisitorSessionRoute("GET", "/visitor/local-service-providers")).toBe(true);
    expect(isPublicRoute("GET", "/visitor/local-service-providers")).toBe(false);
  });
});
