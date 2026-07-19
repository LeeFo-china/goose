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
    const routes: Array<{ path: string; handler: (request: unknown) => Promise<unknown> }> = [];
    controller.registerExtraRoutes({
      post: (path: string, handler: (request: unknown) => Promise<unknown>) =>
        routes.push({ path, handler }),
    } as never);

    expect(routes.map(({ path }) => path)).toEqual(["/douyin-mini/auth/session"]);
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
