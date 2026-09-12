import { beforeAll, describe, expect, mock, test } from "bun:test";
import Fastify from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.JWT_SECRET ??= "test-jwt-secret-at-least-thirty-two-characters";

let Controller: typeof import(".").VisitorRenderingsController;

beforeAll(async () => {
  ({ VisitorRenderingsController: Controller } = await import("."));
});

describe("VisitorRenderingsController", () => {
  test("registers exactly the WeChat rendering routes as session surfaces", () => {
    const controller = new Controller({ getQuota: mock(), bindPhone: mock() } as never);
    const routes: Array<{ method: string; path: string; access: string }> = [];
    const capture = (method: string) => (
      path: string,
      options: { config: { tenantServiceAccess: string } },
    ) => routes.push({ method, path, access: options.config.tenantServiceAccess });

    controller.registerExtraRoutes({
      get: capture("GET"),
      post: capture("POST"),
    } as never);

    expect(routes).toEqual([
      { method: "GET", path: "/visitor/renderings/quota", access: "session" },
      { method: "POST", path: "/visitor/renderings/phone:bind", access: "session" },
      { method: "GET", path: "/visitor/renderings/styles", access: "session" },
      { method: "GET", path: "/visitor/renderings/styles/:id", access: "session" },
    ]);
  });

  test("validates catalog query and ID before dispatching signed WeChat actor", async () => {
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
    const user = { token_type: "visitor_session", openid: "openid", visitor_id: "visitor" };

    await expect(controller.listStyles({ user, query: { page: "2", style: "cream" } } as never))
      .resolves.toEqual({ data: listResult, message: "success" });
    await expect(controller.getStyle({ user, params: { id: style.id } } as never))
      .resolves.toEqual({ data: style, message: "success" });
    expect(listStyles).toHaveBeenCalledWith(user, "wechat", {
      page: 2, pageSize: 20, style: "cream",
    });
    expect(getStyle).toHaveBeenCalledWith(user, "wechat", style.id);

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

  test("passes only the signed user and strict command to the shared service", async () => {
    const quota = {
      trial_used: false,
      phone_verified: false,
      consumed: 0,
      reserved: 0,
      remaining: 1,
      active_job_id: null,
      can_generate: true,
      blocked_reason: null,
    } as const;
    const boundQuota = { ...quota, phone_verified: true, remaining: 5 } as const;
    const getQuota = mock(async () => quota);
    const bindPhone = mock(async () => boundQuota);
    const controller = new Controller({ getQuota, bindPhone } as never);
    const user = { token_type: "visitor_session", openid: "openid", visitor_id: "visitor" };
    const command = { idempotency_key: "11111111-1111-4111-8111-111111111111" };

    await expect(controller.getQuota({ user } as never)).resolves.toEqual({
      data: quota,
      message: "success",
    });
    await expect(controller.bindPhone({ user, body: command } as never)).resolves.toEqual({
      data: boundQuota,
      message: "success",
    });
    expect(getQuota).toHaveBeenCalledWith(user, "wechat");
    expect(bindPhone).toHaveBeenCalledWith(user, "wechat", command);

    await expect(controller.bindPhone({ user, body: { ...command, phone: "13800000000" } } as never))
      .rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(bindPhone).toHaveBeenCalledTimes(1);
  });

  test("signed visitor gets HTTP 400 for malformed catalog ID before service call", async () => {
    const { default: authPlugin } = await import("@/plugins/auth/legacy-plugin");
    const { default: errorHandler } = await import("@/plugins/error-handler");
    const { signVisitorSessionToken } = await import("@/utils/jwt");
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
      const headers = { authorization: `Bearer ${signVisitorSessionToken({
        openid: "openid-rendering-catalog", visitor_id: "visitor-rendering-catalog",
      })}` };
      const invalid = await app.inject({
        method: "GET", url: "/visitor/renderings/styles/invalid", headers,
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });
      expect(getStyle).not.toHaveBeenCalled();
      expect((await app.inject({
        method: "GET", url: "/visitor/renderings/styles?tenant_id=forged", headers,
      })).statusCode).toBe(400);
      expect(listStyles).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
