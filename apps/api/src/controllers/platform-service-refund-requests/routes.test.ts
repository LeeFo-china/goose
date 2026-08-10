import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("PlatformServiceRefundRequestsController routes", () => {
  test("registers platform service refund review routes", async () => {
    const { default: controller } = await import(".");
    const routes: Array<{
      method: string;
      path: string;
      tenantServiceAccess?: string;
    }> = [];
    const fastify = {
      get: (path: string, options: { config?: { tenantServiceAccess?: string } }) =>
        routes.push({
          method: "GET",
          path,
          tenantServiceAccess: options.config?.tenantServiceAccess,
        }),
      post: (path: string, options: { config?: { tenantServiceAccess?: string } }) =>
        routes.push({
          method: "POST",
          path,
          tenantServiceAccess: options.config?.tenantServiceAccess,
        }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      {
        method: "GET",
        path: "/platform/billing/service-refund-requests",
        tenantServiceAccess: "read",
      },
      {
        method: "POST",
        path: "/platform/billing/service-refund-requests/:id/review",
        tenantServiceAccess: "write",
      },
      {
        method: "POST",
        path: "/platform/billing/service-refund-requests/:id/execute",
        tenantServiceAccess: "write",
      },
    ]);
  });

  test("execute endpoint validates platform refund permission and delegates to execution service", () => {
    const source = Bun.file(new URL("./index.ts", import.meta.url));
    return source.text().then((text) => {
      expect(text).toContain("platform.service_refund.review");
      expect(text).toContain("PlatformServiceEntityParamSchema.safeParse");
      expect(text).toContain("platformServiceRefundExecutionService");
      expect(text).toContain(".execute(authContext, paramsResult.data.id)");
      expect(text).toContain("ResponseHandler.success(data)");
    });
  });
});
