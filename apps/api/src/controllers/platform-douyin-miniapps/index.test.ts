import { beforeAll, describe, expect, mock, test } from "bun:test";
import { DOUYIN_DEFAULT_CONTACT_SLA_TEXT } from "@gooes/domain";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
let PlatformDouyinMiniappsController:
  typeof import(".").PlatformDouyinMiniappsController;
beforeAll(async () => {
  ({ PlatformDouyinMiniappsController } = await import("."));
});
const runtimeConfig = {
  brand: { logo_url: null, qualifications: [] },
  theme: { primary_color: "#C45A32", navigation_text_color: "black" },
  features: { cases: true, sites: true, sms_lead: true, douyin_phone: false,
    phone_capture_mode: "sms" },
  home_banners: [],
  trust_metrics: [],
  privacy_policy_version: "2026-07-19",
};
const normalizedRuntimeConfig = {
  ...runtimeConfig,
  contact_sla_text: DOUYIN_DEFAULT_CONTACT_SLA_TEXT,
};
function createController() {
  const service = {
    list: mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    getTemplateSource: mock(async () => ({
      template_app_id: "tt0d647bd99301341b01",
      installation: { id: "template-installation" },
    })),
    get: mock(async () => ({ id: "installation" })),
    bind: mock(async () => ({ id: "installation" })),
    createTemplateDevelopment: mock(async () => ({ id: "installation" })),
    updateConfig: mock(async () => ({ id: "installation" })),
    rotateDeploymentKey: mock(async () => ({ id: "installation" })),
    disable: mock(async () => ({ id: "installation" })),
    enable: mock(async () => ({ id: "installation" })),
  };
  const releaseService = {
    list: mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
  };
  const releaseServiceProvider = mock(async () => releaseService);
  const promotionService = {
    getStatus: mock(async () => ({
      template_app_id: "tt0d647bd99301341b01",
      latest_draft: null,
      current_template: null,
    })),
    confirmLatest: mock(async () => ({
      id: "template",
      template_id: "77596",
      template_version: "0.1.4",
    })),
  };
  const promotionServiceProvider = mock(async () => promotionService);
  const controller = new PlatformDouyinMiniappsController(
    service as never,
    releaseServiceProvider as never,
    promotionServiceProvider as never,
  );
  const authContext = { isPlatformAdmin: true, permissions: [] };
  (controller as unknown as Record<string, unknown>).getRequiredPlatformPermissionContext =
    mock(async () => authContext);
  return {
    controller,
    service,
    releaseService,
    releaseServiceProvider,
    promotionService,
    promotionServiceProvider,
    authContext,
  };
}
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
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
      { method: "GET", path: "/platform/douyin-miniapps/template-source" },
      { method: "GET", path: "/platform/douyin-miniapps/deployable-template" },
      {
        method: "POST",
        path: "/platform/douyin-miniapps/deployable-template/confirm-latest",
      },
      { method: "GET", path: "/platform/douyin-miniapps/:id" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/bind" },
      { method: "POST", path: "/platform/douyin-miniapps/template-development" },
      { method: "PATCH", path: "/platform/douyin-miniapps/:id/config" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/rotate-deployment-key" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/disable" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/enable" },
      { method: "GET", path: "/platform/douyin-miniapps/:id/releases" },
    ]);
  });
  test("parses list defaults and returns ResponseHandler.success", async () => {
    const { controller, service, authContext } = createController();
    const result = await controller.listInstallations({ query: {} } as never, {} as never);
    expect(service.list).toHaveBeenCalledWith(authContext, { page: 1, pageSize: 20 });
    expect(result).toEqual({
      data: {
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
      message: "success",
    });
  });
  test("returns the server-configured template source", async () => {
    const { controller, service, authContext } = createController();
    const result = await controller.getTemplateSource({} as never, {} as never);
    expect(service.getTemplateSource).toHaveBeenCalledWith(authContext);
    expect(result).toMatchObject({
      data: {
        template_app_id: "tt0d647bd99301341b01",
        installation: { id: "template-installation" },
      },
      message: "success",
    });
  });
  test("rejects list page sizes above 100 before calling the service", async () => {
    const { controller, service } = createController();
    await expect(controller.listInstallations({ query: { pageSize: 101 } } as never, {} as never))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(service.list).not.toHaveBeenCalled();
  });
  test("rejects unknown list fields and pathologically large pages", async () => {
    for (const query of [
      { page: 1, pageSize: 20, tenant_id: "forged" },
      { page: Number.MAX_SAFE_INTEGER, pageSize: 100 },
    ]) {
      const { controller, service } = createController();
      await expect(controller.listInstallations({ query } as never, {} as never))
        .rejects.toMatchObject({ statusCode: 400 });
      expect(service.list).not.toHaveBeenCalled();
    }
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
  test("dispatches template, config, rotation, disable and enable actions", async () => {
    const { controller, service, authContext } = createController();
    const params = { id: "22222222-2222-4222-8222-222222222222" };
    await controller.createTemplateDevelopment({ body: {
      tenant_id: "33333333-3333-4333-8333-333333333333",
      runtime_config: runtimeConfig,
    } } as never, {} as never);
    await controller.updateConfig({ params, body: {
      runtime_config: runtimeConfig,
    } } as never, {} as never);
    await controller.rotateDeploymentKey({ params } as never, {} as never);
    await controller.disableInstallation({ params } as never, {} as never);
    await controller.enableInstallation({ params } as never, {} as never);
    expect(service.createTemplateDevelopment).toHaveBeenCalledWith(authContext, {
      tenant_id: "33333333-3333-4333-8333-333333333333",
      runtime_config: normalizedRuntimeConfig,
    });
    expect(service.updateConfig).toHaveBeenCalledWith(authContext, params.id, {
      runtime_config: normalizedRuntimeConfig,
    });
    expect(service.rotateDeploymentKey).toHaveBeenCalledWith(authContext, params.id);
    expect(service.disable).toHaveBeenCalledWith(authContext, params.id);
    expect(service.enable).toHaveBeenCalledWith(authContext, params.id);
  });
  test("validates UUID parameters before service calls", async () => {
    const { controller, service } = createController();
    await expect(controller.getInstallation({ params: { id: "bad" } } as never, {} as never))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(service.get).not.toHaveBeenCalled();
  });
  test("lists releases with strict defaults after platform authentication", async () => {
    const { controller, releaseService, releaseServiceProvider, authContext } = createController();
    const result = await controller.listReleases({
      params: { id: INSTALLATION_ID },
      query: {},
    } as never, {} as never);
    expect(releaseServiceProvider).toHaveBeenCalledTimes(1);
    expect(releaseService.list).toHaveBeenCalledWith(
      authContext,
      INSTALLATION_ID,
      { page: 1, pageSize: 20 },
    );
    expect(result).toEqual({
      data: {
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
      message: "success",
    });
  });
  test("rejects invalid release list queries before resolving the release service", async () => {
    for (const query of [
      { page: "1", pageSize: "101" },
      { page: "1", pageSize: "20", tenant_id: "forged" },
    ]) {
      const { controller, releaseService, releaseServiceProvider } = createController();
      await expect(controller.listReleases({
        params: { id: INSTALLATION_ID },
        query,
      } as never, {} as never)).rejects.toMatchObject({ statusCode: 400 });
      expect(releaseServiceProvider).not.toHaveBeenCalled();
      expect(releaseService.list).not.toHaveBeenCalled();
    }
  });
  test("returns template status and confirms the latest draft without a merchant id", async () => {
    const {
      controller,
      promotionService,
      promotionServiceProvider,
      authContext,
    } = createController();
    const status = await controller.getDeployableTemplateStatus({
      query: { channel: "default" },
    } as never, {} as never);
    const result = await controller.confirmLatestTemplate({
      query: {},
      body: {
        channel: "default",
      },
    } as never, {} as never);
    expect(promotionServiceProvider).toHaveBeenCalledTimes(2);
    expect(promotionService.getStatus).toHaveBeenCalledWith(
      authContext,
      { channel: "default" },
    );
    expect(promotionService.confirmLatest).toHaveBeenCalledWith(
      authContext,
      {
        channel: "default",
      },
    );
    expect(status).toMatchObject({
      data: { template_app_id: "tt0d647bd99301341b01" },
      message: "success",
    });
    expect(result).toMatchObject({
      data: { id: "template", template_id: "77596" },
      message: "success",
    });
  });
  test("rejects invalid template promotion bodies before resolving the service", async () => {
    for (const body of [
      { channel: "beta" },
      {
        channel: "default",
        template_app_id: "ttd033a68e4e56ccd301",
      },
    ]) {
      const { controller, promotionServiceProvider } = createController();
      await expect(controller.confirmLatestTemplate({
        query: {},
        body,
      } as never, {} as never)).rejects.toMatchObject({ statusCode: 400 });
      expect(promotionServiceProvider).not.toHaveBeenCalled();
    }
  });
  test("rejects non-empty queries for template confirmation", async () => {
    const { controller, promotionServiceProvider } = createController();
    await expect(controller.confirmLatestTemplate({
      query: { unexpected: "forged" },
      body: { channel: "default" },
    } as never, {} as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(promotionServiceProvider).not.toHaveBeenCalled();
  });
});
