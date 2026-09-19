import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformAdminReviewWorkbenchController routes", () => {
  test("registers the mobile review workbench contract", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{ method: string; path: string }> = [];
    controller.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    } as never);

    expect(routes).toEqual([
      { method: "GET", path: "/platform/admin/review-workbench/summary" },
      { method: "GET", path: "/platform/admin/tenant-onboarding/applications" },
      { method: "GET", path: "/platform/admin/tenant-onboarding/applications/:id" },
      { method: "GET", path: "/platform/admin/tenant-onboarding/applications/:id/business-license/preview-url" },
      { method: "POST", path: "/platform/admin/tenant-onboarding/applications/:id/approve" },
      { method: "POST", path: "/platform/admin/tenant-onboarding/applications/:id/reject" },
      { method: "POST", path: "/platform/admin/tenant-onboarding/applications/:id/request-supplement" },
      { method: "GET", path: "/platform/admin/partner-applications" },
      { method: "GET", path: "/platform/admin/partner-applications/:id" },
      { method: "POST", path: "/platform/admin/partner-applications/:id/approve" },
      { method: "POST", path: "/platform/admin/partner-applications/:id/reject" },
      { method: "POST", path: "/platform/admin/partner-applications/:id/request-supplement" },
      { method: "GET", path: "/platform/admin/review-logs" },
    ]);
    expect(routes.every(({ path }) => path.startsWith("/platform/admin/"))).toBe(true);
  });
});
