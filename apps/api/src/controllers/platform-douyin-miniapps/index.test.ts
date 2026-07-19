import { describe, expect, mock, test } from "bun:test";
import { PlatformDouyinMiniappsController } from ".";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const runtimeConfig = {
  brand: { logo_url: null, qualifications: [] },
  theme: { primary_color: "#C45A32", navigation_text_color: "black" },
  features: { cases: true, sites: true, sms_lead: true, douyin_phone: false,
    phone_capture_mode: "sms" },
  home_banners: [],
  trust_metrics: [],
  privacy_policy_version: "2026-07-19",
};

function createController() {
  const service = {
    list: mock(async () => ({ list: [] })),
    get: mock(async () => ({ id: "installation" })),
    bind: mock(async () => ({ id: "installation" })),
    createTemplateDevelopment: mock(async () => ({ id: "installation" })),
    updateConfig: mock(async () => ({ id: "installation" })),
    rotateDeploymentKey: mock(async () => ({ id: "installation" })),
    disable: mock(async () => ({ id: "installation" })),
    enable: mock(async () => ({ id: "installation" })),
  };
  const controller = new PlatformDouyinMiniappsController(service as never);
  const authContext = { isPlatformAdmin: true, permissions: [] };
  (controller as unknown as Record<string, unknown>).getRequiredPlatformAdminContext =
    mock(async () => authContext);
  return { controller, service, authContext };
}

describe("PlatformDouyinMiniappsController", () => {
  test("registers all platform installation management routes", () => {
    const { controller } = createController();
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/platform/douyin-miniapps" },
      { method: "GET", path: "/platform/douyin-miniapps/:id" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/bind" },
      { method: "POST", path: "/platform/douyin-miniapps/template-development" },
      { method: "PATCH", path: "/platform/douyin-miniapps/:id/config" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/rotate-deployment-key" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/disable" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/enable" },
    ]);
  });

  test("parses list defaults and returns ResponseHandler.success", async () => {
    const { controller, service, authContext } = createController();
    const result = await controller.listInstallations({ query: {} } as never, {} as never);

    expect(service.list).toHaveBeenCalledWith(authContext, { page: 1, pageSize: 20 });
    expect(result).toEqual({ data: { list: [] }, message: "success" });
  });

  test("rejects list page sizes above 100 before calling the service", async () => {
    const { controller, service } = createController();
    await expect(controller.listInstallations({ query: { pageSize: 101 } } as never, {} as never))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(service.list).not.toHaveBeenCalled();
  });

  test("bind accepts only tenant_id and a complete strict runtime config", async () => {
    const { controller, service } = createController();
    const params = { id: "22222222-2222-4222-8222-222222222222" };

    await controller.bindInstallation({ params, body: {
      tenant_id: "33333333-3333-4333-8333-333333333333",
      runtime_config: runtimeConfig,
    } } as never, {} as never);
    expect(service.bind).toHaveBeenCalledTimes(1);

    await expect(controller.bindInstallation({ params, body: {
      tenant_id: "33333333-3333-4333-8333-333333333333",
      runtime_config: runtimeConfig,
      deployment_key: "client-controlled",
    } } as never, {} as never)).rejects.toMatchObject({ statusCode: 400 });

    await expect(controller.bindInstallation({ params, body: {
      tenant_id: "33333333-3333-4333-8333-333333333333",
      runtime_config: { brand: runtimeConfig.brand },
    } } as never, {} as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(service.bind).toHaveBeenCalledTimes(1);
  });

  test("validates UUID parameters before service calls", async () => {
    const { controller, service } = createController();
    await expect(controller.getInstallation({ params: { id: "bad" } } as never, {} as never))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(service.get).not.toHaveBeenCalled();
  });
});
