import { afterEach, expect, mock, spyOn, test } from "bun:test";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
afterEach(() => mock.restore());
const id = "00000000-0000-4000-8000-000000000001";
test("new controller routes preserve project contract and validate pagination", async () => {
  const { default: Fastify } = await import("fastify");
  const { default: errorHandler } = await import("@/plugins/error-handler");
  const { default: controller } = await import("@/controllers/project-log-comments");
  const app = Fastify();
  errorHandler(app);
  app.addHook("onRequest", async (request) => { request.user = { sub: id, tenant_id: id, customer_id: id, roles: ["customer"], login_channel: "wechat", openid: "bound" }; });
  controller.registerExtraRoutes(app);
  const url = `/project_logs/${id}/project-comments`;
  try {
    const { projectLogProjectCommentsRepository: repo } = await import("@/repositories/project-log-project-comments");
    const { projectLogCommunicationAccess: access } = await import("./project-log-communication-access");
    const { projectLogCommunicationRollout: rollout } = await import("./project-log-communication-rollout");
    const { userIdentityRepository } = await import("@/repositories/user-identities");
    const { wechatContentSafetyGateway } = await import("./wechat-content-safety-gateway");
    spyOn(rollout, "assertProjectAvailable").mockResolvedValue();
    spyOn(access, "resolve").mockResolvedValue({ tenantId: id, type: "customer", author: { id, name: "业主" }, canWrite: true });
    spyOn(repo, "findLog").mockResolvedValue({ id, tenant_id: id, project_id: id });
    spyOn(repo, "listApproved").mockResolvedValue({ list: [], total: 0 });
    spyOn(repo, "listAuthors").mockResolvedValue([]);
    spyOn(repo, "create").mockImplementation(async (row) => ({ ...row, id, created_at: "2026-10-10T00:00:00Z" }));
    spyOn(userIdentityRepository, "findActiveOauthIdentity").mockResolvedValue({ id, user_id: id, platform: "wechat_mini", openid: "bound", unionid: null, status: "active", bound_at: "", unbound_at: null, created_at: "", updated_at: "" });
    const moderation = spyOn(wechatContentSafetyGateway, "checkText");
    for (const status of ["approved", "pending"] as const) {
      moderation.mockResolvedValue({ status, traceId: "private-trace" });
      const response = await app.inject({ method: "POST", url, payload: { content: "施工复核" } });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({ visibility: "project", published: status === "approved", moderation_status: status });
      expect(response.body).not.toContain("private-trace");
      if (status === "pending")
        expect(response.json().data.content).toBeUndefined();
    }
    moderation.mockResolvedValue({ status: "rejected", traceId: "t" });
    expect((await app.inject({ method: "POST", url, payload: { content: "风险" } })).statusCode).toBe(422);
    expect((await app.inject({ url })).json().data).toMatchObject({ list: [], total: 0, page: 1, pageSize: 20, can_write: true });
    expect((await app.inject({ url: url + "?pageSize=101" })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url, payload: { content: "图片", images: ["a"] } })).json().code).toBe("COMMENT_MEDIA_DISABLED");
    expect((await app.inject({ method: "POST", url, payload: { content: "伪造", author_type: "employee" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url, payload: { content: "编辑" } })).statusCode).toBe(404);
  }
  finally {
    await app.close();
  }
});
test("real authentication rejects anonymous access to project communication", async () => {
  const { default: Fastify } = await import("fastify");
  const { default: auth } = await import("@/plugins/auth");
  const { default: controller } = await import("@/controllers/project-log-comments");
  const app = Fastify();
  auth(app);
  controller.registerExtraRoutes(app);
  try {
    for (const method of ["GET", "POST"] as const)
      expect((await app.inject({ method, url: `/project_logs/${id}/project-comments` })).statusCode).toBe(401);
  }
  finally {
    await app.close();
  }
});
