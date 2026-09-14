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

test("private upload HTTP validates session, DTO and UUID and wraps success", async () => {
  const { default: authPlugin } = await import("@/plugins/auth/legacy-plugin");
  const { default: errorHandler } = await import("@/plugins/error-handler");
  const { signVisitorSessionToken, signDouyinMiniappToken } = await import("@/utils/jwt");
  const { Errors } = await import("@/errors/error-factory");
  const id = "11111111-1111-4111-8111-111111111111";
  const result = { file_id: id, status: "pending_review", mime_type: "image/webp", width: 16, height: 12, size_bytes: 100 } as const;
  const createIntent = mock(async () => ({ intent_id: id, method: "PUT" as const,
    upload_url: "https://example.com/signed", headers: {}, expires_at: "2026-09-13T12:00:00.000Z" }));
  const complete = mock(async () => result);
  const getStatus = mock(async () => ({ file_id: id, status: 'issued' as const,
    review_state: null, mime_type: null, width: null, height: null, size_bytes: null }));
  await expect(new Controller(undefined, undefined, { createIntent, complete, getStatus })
    .completeInput({ params: { id }, body: null } as never)).rejects.toMatchObject({ statusCode: 400 });
  const app = Fastify({ logger: false }); errorHandler(app); authPlugin(app);
  new Controller(undefined, undefined, { createIntent, complete, getStatus }).registerExtraRoutes(app);
  await app.ready();
  const token = signDouyinMiniappToken({ tenant_id: id, douyin_installation_id: id, douyin_app_id: "tt-app", subject_hash: "a".repeat(64) });
  const headers = { authorization: `Bearer ${token}` };
  const intentUrl = "/douyin-mini/renderings/uploads:intent";
  const completeUrl = `/douyin-mini/renderings/uploads/${id}/complete`;
  const payload = { purpose: "room", mime_type: "image/png", size_bytes: 100 };
  try {
    for (const url of [intentUrl, completeUrl]) {
      expect((await app.inject({ method: "POST", url, payload: url === intentUrl ? payload : {} })).statusCode).toBe(401);
      expect((await app.inject({ method: "POST", url, headers: { authorization: "Bearer invalid" }, payload: {} })).statusCode).toBe(401);
    }
    expect(createIntent).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
    for (const [url, body] of [[intentUrl, { ...payload, tenant_id: id }], [completeUrl, { object_key: "forged" }],
      ["/douyin-mini/renderings/uploads/invalid/complete", {}], [completeUrl + "?subject=forged", {}]] as const) {
      expect((await app.inject({ method: "POST", url, headers, payload: body })).statusCode).toBe(400);
    }
    expect(createIntent).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
    const intent = await app.inject({ method: "POST", url: intentUrl, headers, payload });
    expect(intent.statusCode).toBe(200); expect(intent.json()).toMatchObject({ data: { intent_id: id }, message: "success" });
    expect(createIntent).toHaveBeenCalledWith(expect.objectContaining({ token_type: "douyin_miniapp" }), "douyin", payload);
    const response = await app.inject({ method: "POST", url: completeUrl, headers, payload: {} });
    expect(response.statusCode).toBe(200);
    const responseBody: unknown = response.json();
    expect(responseBody).toEqual({ data: result, message: "success" });
    expect(complete).toHaveBeenCalledWith(expect.anything(), "douyin", id);
    createIntent.mockRejectedValue(Errors.business(409, "请先选择装修公司", "RENDERING_TENANT_CONTEXT_REQUIRED"));
    const unselected = await app.inject({ method: "POST", url: intentUrl, headers, payload });
    expect(unselected.statusCode).toBe(409); expect(unselected.json()).toMatchObject({ code: "RENDERING_TENANT_CONTEXT_REQUIRED" });
  } finally { await app.close(); }
});

test('private upload status GET validates session, UUID and empty query before dispatch', async () => {
  const { default: authPlugin } = await import('@/plugins/auth/legacy-plugin');
  const { default: errorHandler } = await import('@/plugins/error-handler');
  const { signDouyinMiniappToken, signVisitorSessionToken } = await import('@/utils/jwt');
  const id = '11111111-1111-4111-8111-111111111111';
  const result = { file_id: id, status: 'rejected', review_state: null, mime_type: 'image/webp', width: 16, height: 12, size_bytes: 100 } as const;
  const getStatus = mock(async () => result);
  const app = Fastify({ logger: false }); errorHandler(app); authPlugin(app);
  new Controller(undefined, undefined, { getStatus } as never).registerExtraRoutes(app);
  await app.ready();
  const url = `/douyin-mini/renderings/uploads/${id}`;
  const headers = { authorization: `Bearer ${signDouyinMiniappToken({ tenant_id: id,
    douyin_installation_id: id, douyin_app_id: 'tt-app', subject_hash: 'a'.repeat(64) })}` };
  try {
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signVisitorSessionToken({
      openid: 'openid', visitor_id: 'visitor',
    })}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/douyin-mini/renderings/uploads/invalid', headers })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${url}?subject=forged`, headers })).statusCode).toBe(400);
    expect(getStatus).not.toHaveBeenCalled();
    const response = await app.inject({ method: 'GET', url, headers });
    expect(response.statusCode).toBe(200);
    expect((await app.inject({ method: 'HEAD', url, headers })).statusCode).toBe(200);
    const responseBody: unknown = response.json();
    expect(responseBody).toEqual({ data: result, message: 'success' });
    expect(getStatus).toHaveBeenCalledWith(expect.objectContaining({ token_type: 'douyin_miniapp' }), 'douyin', id);
  } finally { await app.close(); }
});

test('job HTTP accepts only signed Douyin session and strict shared DTO', async () => {
  const { default: authPlugin } = await import('@/plugins/auth/legacy-plugin');
  const { default: errorHandler } = await import('@/plugins/error-handler');
  const { signDouyinMiniappToken } = await import('@/utils/jwt');
  const jobId = '66666666-6666-4666-8666-666666666666';
  const create = mock(async () => ({ job_id: jobId, status: 'queued' as const, quota: { remaining: 0 } }));
  const app = Fastify({ logger: false }); errorHandler(app); authPlugin(app);
  new Controller(undefined, undefined, undefined, { create } as never).registerExtraRoutes(app);
  await app.ready();
  const url = '/douyin-mini/renderings/jobs';
  const payload = { style_asset_id: '22222222-2222-4222-8222-222222222222',
    room_file_id: '33333333-3333-4333-8333-333333333333', space: 'living_room',
    mode: 'soft_furnishing', idempotency_key: '44444444-4444-4444-8444-444444444444' };
  const headers = { authorization: `Bearer ${signDouyinMiniappToken({
    tenant_id: jobId, douyin_installation_id: jobId, douyin_app_id: 'tt-app', subject_hash: 'a'.repeat(64),
  })}` };
  try {
    expect((await app.inject({ method: 'POST', url, payload })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url, headers, payload: { ...payload, tenant_id: jobId } })).statusCode).toBe(400);
    expect(create).not.toHaveBeenCalled();
    const result = await app.inject({ method: 'POST', url, headers, payload });
    expect(result.statusCode).toBe(202);
    expect(result.json()).toMatchObject({ data: { job_id: jobId, status: 'queued' } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ token_type: 'douyin_miniapp' }), 'douyin', payload);
  } finally { await app.close(); }
});

test('job status GET requires the Douyin session and rejects forged query scope', async () => {
  const { default: authPlugin } = await import('@/plugins/auth/legacy-plugin');
  const { default: errorHandler } = await import('@/plugins/error-handler');
  const { signDouyinMiniappToken } = await import('@/utils/jwt');
  const id = '11111111-1111-4111-8111-111111111111';
  const result = { job_id: id, status: 'processing' as const, created_at: '2026-09-14T00:00:00Z',
    updated_at: '2026-09-14T00:00:00Z', finished_at: null, result: null };
  const get = mock(async () => result);
  const app = Fastify({ logger: false }); errorHandler(app); authPlugin(app);
  new Controller(undefined, undefined, undefined, undefined, { get } as never).registerExtraRoutes(app);
  await app.ready();
  const url = `/douyin-mini/renderings/jobs/${id}`;
  const headers = { authorization: `Bearer ${signDouyinMiniappToken({ tenant_id: id,
    douyin_installation_id: id, douyin_app_id: 'tt-app', subject_hash: 'a'.repeat(64) })}` };
  try {
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/douyin-mini/renderings/jobs/invalid', headers })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${url}?subject=forged`, headers })).statusCode).toBe(400);
    expect(get).not.toHaveBeenCalled();
    const responseBody: unknown = (await app.inject({ method: 'GET', url, headers })).json();
    expect(responseBody).toEqual({ data: result, message: 'success' });
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ token_type: 'douyin_miniapp' }), 'douyin', id);
  } finally { await app.close(); }
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
      { method: "POST", path: "/douyin-mini/renderings/uploads:intent", access: "session" },
      { method: "POST", path: "/douyin-mini/renderings/uploads/:id/complete", access: "session" },
      { method: "GET", path: "/douyin-mini/renderings/uploads/:id", access: "session" },
      { method: "POST", path: "/douyin-mini/renderings/jobs", access: "session" },
      { method: "GET", path: "/douyin-mini/renderings/jobs/:id", access: "session" },
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
