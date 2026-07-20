import { beforeAll, describe, expect, mock, test } from "bun:test";

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

function createController() {
  const service = {
    list: mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
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
    upload: mock(async () => ({ id: "release", status: "uploaded" })),
    getTestQr: mock(async () => ({ id: "release", status: "testing" })),
    submitAudit: mock(async () => ({ id: "release", status: "audit_pending" })),
    syncStatus: mock(async () => ({ id: "release", status: "audit_approved" })),
    publish: mock(async () => ({ id: "release", status: "released" })),
  };
  const releaseServiceProvider = mock(async () => releaseService);
  const controller = new PlatformDouyinMiniappsController(
    service as never,
    releaseServiceProvider as never,
  );
  const authContext = { isPlatformAdmin: true, permissions: [] };
  (controller as unknown as Record<string, unknown>).getRequiredPlatformAdminContext =
    mock(async () => authContext);
  return { controller, service, releaseService, releaseServiceProvider, authContext };
}

const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
const RELEASE_ID = "11111111-1111-4111-8111-111111111111";

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
      { method: "GET", path: "/platform/douyin-miniapps/:id/releases" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/releases/upload" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/releases/:releaseId/test-qr" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/releases/:releaseId/submit-audit" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/releases/:releaseId/sync-status" },
      { method: "POST", path: "/platform/douyin-miniapps/:id/releases/:releaseId/publish" },
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
      runtime_config: runtimeConfig,
    });
    expect(service.updateConfig).toHaveBeenCalledWith(authContext, params.id, {
      runtime_config: runtimeConfig,
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

  test("validates both installation and release UUIDs before resolving the service", async () => {
    for (const params of [
      { id: "bad", releaseId: RELEASE_ID },
      { id: INSTALLATION_ID, releaseId: "bad" },
      { id: INSTALLATION_ID, releaseId: RELEASE_ID, unknown: "forged" },
    ]) {
      const { controller, releaseServiceProvider } = createController();
      await expect(controller.getReleaseTestQr({ params } as never, {} as never))
        .rejects.toMatchObject({ statusCode: 400 });
      expect(releaseServiceProvider).not.toHaveBeenCalled();
    }
  });

  test("dispatches a strict normalized upload body", async () => {
    const { controller, releaseService, authContext } = createController();
    const body = {
      template_id: "9133504853504535288",
      template_version: "1.2.3-beta.1+build.7",
      description: "  装修模板首发  ",
      channel: "default",
    };
    const result = await controller.uploadRelease({
      params: { id: INSTALLATION_ID },
      query: {},
      body,
    } as never, {} as never);
    expect(releaseService.upload).toHaveBeenCalledWith(authContext, INSTALLATION_ID, {
      ...body,
      description: "装修模板首发",
    });
    expect(result).toMatchObject({
      data: { id: "release", status: "uploaded" },
      message: "success",
    });
  });

  test("rejects malformed upload versions and unknown fields before provider access", async () => {
    for (const body of [
      {
        template_id: "9133504853504535288",
        template_version: "01.2.3",
        description: "装修模板首发",
        channel: "default",
      },
      {
        template_id: "9133504853504535288",
        template_version: "1.2.3",
        description: "装修模板首发",
        channel: "default",
        access_token: "forged",
      },
    ]) {
      const { controller, releaseServiceProvider } = createController();
      await expect(controller.uploadRelease({
        params: { id: INSTALLATION_ID },
        body,
      } as never, {} as never)).rejects.toMatchObject({ statusCode: 400 });
      expect(releaseServiceProvider).not.toHaveBeenCalled();
    }
  });

  test("submits only unique safe audit hosts and a normalized note", async () => {
    const { controller, releaseService, authContext } = createController();
    await controller.submitReleaseAudit({
      params: { id: INSTALLATION_ID, releaseId: RELEASE_ID },
      query: {},
      body: {
        host_names: ["douyin.com", "open.douyin.com"],
        audit_note: "  装修模板提审  ",
      },
    } as never, {} as never);
    expect(releaseService.submitAudit).toHaveBeenCalledWith(
      authContext,
      INSTALLATION_ID,
      RELEASE_ID,
      {
        host_names: ["douyin.com", "open.douyin.com"],
        audit_note: "装修模板提审",
      },
    );
  });

  test("rejects unsafe audit hosts, notes, duplicates, and unknown fields", async () => {
    for (const body of [
      { host_names: ["douyin.com", "douyin.com"], audit_note: "提审" },
      { host_names: ["bad host"], audit_note: "提审" },
      { host_names: ["token.example.com"], audit_note: "提审" },
      { host_names: ["douyin.com"], audit_note: "openid must not persist" },
      { host_names: ["douyin.com"], audit_note: "提审", unknown: true },
    ]) {
      const { controller, releaseServiceProvider } = createController();
      await expect(controller.submitReleaseAudit({
        params: { id: INSTALLATION_ID, releaseId: RELEASE_ID },
        body,
      } as never, {} as never)).rejects.toMatchObject({ statusCode: 400 });
      expect(releaseServiceProvider).not.toHaveBeenCalled();
    }
  });

  test("dispatches bodyless release actions with auth context and success responses", async () => {
    const { controller, releaseService, authContext } = createController();
    const request = {
      params: { id: INSTALLATION_ID, releaseId: RELEASE_ID },
      query: {},
      body: {},
    } as never;
    const qr = await controller.getReleaseTestQr(request, {} as never);
    const synced = await controller.syncReleaseStatus(request, {} as never);
    const published = await controller.publishRelease(request, {} as never);
    expect(releaseService.getTestQr).toHaveBeenCalledWith(
      authContext, INSTALLATION_ID, RELEASE_ID,
    );
    expect(releaseService.syncStatus).toHaveBeenCalledWith(
      authContext, INSTALLATION_ID, RELEASE_ID,
    );
    expect(releaseService.publish).toHaveBeenCalledWith(
      authContext, INSTALLATION_ID, RELEASE_ID,
    );
    expect([qr, synced, published]).toEqual([
      { data: { id: "release", status: "testing" }, message: "success" },
      { data: { id: "release", status: "audit_approved" }, message: "success" },
      { data: { id: "release", status: "released" }, message: "success" },
    ]);
  });

  test("rejects every non-empty-object body for bodyless actions before provider access", async () => {
    const invalidBodies = [null, false, 0, "bodyless", [], { ignored: "bodyless" }];
    for (const body of invalidBodies) {
      for (const action of [
        "getReleaseTestQr",
        "syncReleaseStatus",
        "publishRelease",
      ] as const) {
        const { controller, releaseServiceProvider } = createController();
        await expect(controller[action]({
          params: { id: INSTALLATION_ID, releaseId: RELEASE_ID },
          query: {},
          body,
        } as never, {} as never)).rejects.toMatchObject({ statusCode: 400 });
        expect(releaseServiceProvider).not.toHaveBeenCalled();
      }
    }
  });

  test("rejects non-empty queries for every release POST before provider access", async () => {
    const cases = [
      {
        action: "uploadRelease",
        params: { id: INSTALLATION_ID },
        body: {
          template_id: "9133504853504535288",
          template_version: "1.2.3",
          description: "装修模板首发",
          channel: "default",
        },
      },
      {
        action: "getReleaseTestQr",
        params: { id: INSTALLATION_ID, releaseId: RELEASE_ID },
        body: {},
      },
      {
        action: "submitReleaseAudit",
        params: { id: INSTALLATION_ID, releaseId: RELEASE_ID },
        body: { host_names: ["douyin.com"], audit_note: "提审" },
      },
      {
        action: "syncReleaseStatus",
        params: { id: INSTALLATION_ID, releaseId: RELEASE_ID },
        body: {},
      },
      {
        action: "publishRelease",
        params: { id: INSTALLATION_ID, releaseId: RELEASE_ID },
        body: {},
      },
    ] as const;

    for (const { action, params, body } of cases) {
      const { controller, releaseServiceProvider } = createController();
      await expect(controller[action]({
        params,
        query: { unexpected: "forged" },
        body,
      } as never, {} as never)).rejects.toMatchObject({ statusCode: 400 });
      expect(releaseServiceProvider).not.toHaveBeenCalled();
    }
  });
});
