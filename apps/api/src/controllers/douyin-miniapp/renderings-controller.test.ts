import { beforeAll, describe, expect, mock, test } from "bun:test";
import Fastify from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.JWT_SECRET ??= "test-jwt-secret-at-least-thirty-two-characters";

let Controller: typeof import("./renderings-controller").DouyinRenderingsController;

beforeAll(async () => {
  ({ DouyinRenderingsController: Controller } = await import("./renderings-controller"));
});

describe("DouyinRenderingsController", () => {
  test("registers exact session-only rendering routes", () => {
    const controller = new Controller({ getQuota: mock(), bindPhone: mock() } as never);
    const routes: Array<{ method: string; path: string; access: string }> = [];
    const capture = (method: string) => (
      path: string,
      options: { config: { tenantServiceAccess: string } },
    ) => routes.push({ method, path, access: options.config.tenantServiceAccess });
    controller.registerExtraRoutes({ get: capture("GET"), post: capture("POST") } as never);
    expect(routes).toEqual([
      { method: "GET", path: "/douyin-mini/renderings/quota", access: "session" },
      { method: "POST", path: "/douyin-mini/renderings/phone:bind", access: "session" },
      { method: "GET", path: "/douyin-mini/renderings/styles", access: "session" },
      { method: "GET", path: "/douyin-mini/renderings/styles/:id", access: "session" },
    ]);
  });

  test("validates catalog query and ID before dispatching signed Douyin actor", async () => {
    const listResult = { list: [], pagination: {
      page: 2, pageSize: 20, total: 0, totalPages: 0,
    } };
    const style = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "客厅效果",
      space: "living_room" as const,
      style: "cream" as const,
      color_notes: "暖白",
      material_notes: "原木",
      source_type: "design" as const,
      image_url: "https://example.com/style.webp",
      published_at: "2026-09-13T00:00:00.000Z",
    };
    const listStyles = mock(async () => listResult);
    const getStyle = mock(async () => style);
    const controller = new Controller(undefined, { listStyles, getStyle } as never);
    const user = { token_type: "douyin_miniapp", subject_hash: "a".repeat(64) };

    await expect(controller.listStyles({ user, query: { page: "2", space: "living_room" } } as never))
      .resolves.toEqual({ data: listResult, message: "success" });
    await expect(controller.getStyle({ user, params: { id: style.id } } as never))
      .resolves.toEqual({ data: style, message: "success" });
    expect(listStyles).toHaveBeenCalledWith(user, "douyin", {
      page: 2, pageSize: 20, space: "living_room",
    });
    expect(getStyle).toHaveBeenCalledWith(user, "douyin", style.id);

    for (const query of [{ pageSize: 101 }, { tenant_id: style.id }]) {
      await expect(controller.listStyles({ user, query } as never))
        .rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    }
    await expect(controller.getStyle({ user, params: { id: "invalid" } } as never))
      .rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    await expect(controller.getStyle({ user, params: { id: style.id }, query: {
      tenant_id: style.id,
    } } as never)).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(listStyles).toHaveBeenCalledTimes(1);
    expect(getStyle).toHaveBeenCalledTimes(1);
  });

  test("dispatches only trusted request state and rejects body authority", async () => {
    const getQuota = mock(async () => ({ remaining: 1 }));
    const bindPhone = mock(async () => ({ remaining: 5 }));
    const controller = new Controller({ getQuota, bindPhone } as never);
    const user = { token_type: "douyin_miniapp", subject_hash: "a".repeat(64) };
    const command = { idempotency_key: "11111111-1111-4111-8111-111111111111" };

    await controller.getQuota({ user } as never);
    await controller.bindPhone({ user, body: command } as never);
    expect(getQuota).toHaveBeenCalledWith(user, "douyin");
    expect(bindPhone).toHaveBeenCalledWith(user, "douyin", command);

    await expect(controller.bindPhone({ user, body: { ...command, tenant_id:
      "22222222-2222-4222-8222-222222222222" } } as never))
      .rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(bindPhone).toHaveBeenCalledTimes(1);
  });

  test("signed Douyin mini session gets HTTP 400 for malformed catalog input", async () => {
    const { default: authPlugin } = await import("@/plugins/auth/legacy-plugin");
    const { default: errorHandler } = await import("@/plugins/error-handler");
    const { signDouyinMiniappToken } = await import("@/utils/jwt");
    const listStyles = mock(async () => ({ list: [], pagination: {
      page: 1, pageSize: 20, total: 0, totalPages: 0,
    } }));
    const getStyle = mock(async () => null);
    const app = Fastify({ logger: false });
    errorHandler(app);
    authPlugin(app);
    new Controller(undefined, { listStyles, getStyle } as never).registerExtraRoutes(app);
    await app.ready();
    try {
      const headers = { authorization: `Bearer ${signDouyinMiniappToken({
        tenant_id: "33333333-3333-4333-8333-333333333333",
        douyin_installation_id: "22222222-2222-4222-8222-222222222222",
        douyin_app_id: "tt-app",
        subject_hash: "a".repeat(64),
      })}` };
      const invalid = await app.inject({
        method: "GET", url: "/douyin-mini/renderings/styles/invalid", headers,
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });
      expect(getStyle).not.toHaveBeenCalled();
      expect((await app.inject({
        method: "GET", url: "/douyin-mini/renderings/styles?pageSize=101", headers,
      })).statusCode).toBe(400);
      expect(listStyles).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
