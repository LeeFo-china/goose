import { beforeAll, describe, expect, mock, test } from "bun:test";

let DouyinMiniappController: typeof import(".").DouyinMiniappController;

beforeAll(async () => {
  ({ DouyinMiniappController } = await import("."));
});

const body = {
  app_id: "tt-authorizer-1",
  deployment_key: "deployment-public-key",
  code: "one-time-login-code",
  launch_context: {
    entry_path: "pages/case-detail/index",
    scene: "021001",
    source_type: "short_video",
    campaign_code: "summer-2026",
    content_id: "video-100",
  },
};

describe("DouyinMiniappController", () => {
  test("registers the session route in the root registry", async () => {
    const source = await Bun.file(new URL("../../routes/index.ts", import.meta.url)).text();
    expect(source).toContain(
      'import DouyinMiniappController from "@/controllers/douyin-miniapp";',
    );
    expect(source).toContain("DouyinMiniappController.registerExtraRoutes(app);");
  });

  test("validates and dispatches the exact privacy-safe session request", async () => {
    const exchange = mock(async () => ({
      access_token: "gooes-jwt",
      expires_in: 7200,
      installation: { status: "active", template_version: "1.0.0" },
    }));
    const controller = new DouyinMiniappController({ exchange } as never);
    const routes: Array<{ method: string; path: string;
      handler: (request: unknown) => Promise<unknown> }> = [];
    controller.registerExtraRoutes({
      post: (path: string, handler: (request: unknown) => Promise<unknown>) =>
        routes.push({ method: "POST", path, handler }),
      get: (path: string, handler: (request: unknown) => Promise<unknown>) =>
        routes.push({ method: "GET", path, handler }),
    } as never);

    expect(routes.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /douyin-mini/auth/session",
      "GET /douyin-mini/bootstrap",
      "GET /douyin-mini/company",
      "GET /douyin-mini/cases",
      "GET /douyin-mini/cases/:id",
      "GET /douyin-mini/sites",
      "GET /douyin-mini/sites/:id",
      "GET /douyin-mini/sites/:id/logs",
    ]);
    await expect(routes[0]!.handler({ body })).resolves.toEqual({
      data: {
        access_token: "gooes-jwt",
        expires_in: 7200,
        installation: { status: "active", template_version: "1.0.0" },
      },
      message: "success",
    });
    expect(exchange).toHaveBeenCalledWith(body);
  });

  test("validates strict content queries and dispatches with the authenticated user", async () => {
    const listCases = mock(async () => ({ items: [], pagination: {
      page: 1, pageSize: 20, total: 0, totalPages: 0,
    } }));
    const content = {
      bootstrap: mock(async () => ({})), company: mock(async () => ({})), listCases,
      getCase: mock(async () => ({})), listSites: mock(async () => ({})),
      getSite: mock(async () => ({})), listSiteLogs: mock(async () => ({})),
    };
    const controller = new DouyinMiniappController(undefined, content as never);
    const user = { token_type: "douyin_miniapp", tenant_id:
      "33333333-3333-4333-8333-333333333333" };

    await expect(controller.listCases({ user, query: { style: "现代" } } as never))
      .resolves.toMatchObject({ data: { items: [] } });
    expect(listCases).toHaveBeenCalledWith(user, {
      page: 1, pageSize: 20, style: "现代",
    });
    await expect(controller.listCases({ user, query: { tenant_id:
      "44444444-4444-4444-8444-444444444444" } } as never))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    await expect(controller.listCases({ user, query: { pageSize: 101 } } as never))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
  });

  test("rejects forged tenant IDs and malformed launch attribution", async () => {
    for (const invalidBody of [
      { ...body, tenant_id: "33333333-3333-4333-8333-333333333333" },
      { ...body, launch_context: { ...body.launch_context, entry_path: "pages/admin/index" } },
      { ...body, code: "" },
    ]) {
      const exchange = mock(async () => ({}));
      const controller = new DouyinMiniappController({ exchange } as never);
      await expect(controller.createSession({ body: invalidBody } as never))
        .rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
      expect(exchange).not.toHaveBeenCalled();
    }
  });
});
