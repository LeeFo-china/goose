import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { AuthContext } from "./authorization";
import type { JwtPayload } from "@/utils/jwt";
import { Errors } from "@/errors/error-factory";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test-publish";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role";
afterEach(() => mock.restore());
const id = "00000000-0000-4000-8000-000000000001";
const actor: JwtPayload = { sub: id, employee_id: id, tenant_id: id, roles: ["employee"], login_channel: "wechat", openid: "bound" };

test("real controller/service serialize approved, pending, rejected and unavailable without audit leaks", async () => {
  const { projectLogCommunicationRollout } = await import("./project-log-communication-rollout");
  spyOn(projectLogCommunicationRollout, "assertInternalAvailable").mockResolvedValue();
  const { default: Fastify } = await import("fastify");
  const { default: errorHandler } = await import("@/plugins/error-handler");
  const { default: controller } = await import("@/controllers/project-log-comments");
  const { authorizationService } = await import("./authorization");
  const { accessPolicyService } = await import("./access-policy");
  const { projectLogInternalCommentsRepository: repo } = await import("@/repositories/project-log-internal-comments");
  const { userIdentityRepository } = await import("@/repositories/user-identities");
  const { wechatContentSafetyGateway } = await import("./wechat-content-safety-gateway");
  spyOn(authorizationService, "getRequiredAuthContext").mockResolvedValue({ authUserId: id, employeeId: id, tenantId: id, employeeStatus: "active" } as AuthContext);
  spyOn(accessPolicyService, "canAccessProject").mockResolvedValue(true);
  spyOn(accessPolicyService, "canWriteProjectLog").mockResolvedValue(true);
  spyOn(repo, "findLog").mockResolvedValue({ id, tenant_id: id, project_id: id });
  spyOn(repo, "findActiveEmployee").mockResolvedValue({ id, name: "员工" });
  spyOn(repo, "create").mockImplementation(async row => ({ id, log_id: row.log_id, parent_id: row.parent_id,
    author_id: row.author_id, content: row.content, moderation_status: row.moderation_status, created_at: "2026-10-10T00:00:00Z" }));
  spyOn(repo, "listApproved").mockResolvedValue({ list: [], total: 0 });
  spyOn(repo, "listAuthors").mockResolvedValue([]);
  spyOn(userIdentityRepository, "findActiveOauthIdentity").mockResolvedValue({ id, user_id: id, platform: "wechat_mini", openid: "bound", unionid: null, status: "active", bound_at: "", unbound_at: null, created_at: "", updated_at: "" });
  const moderation = spyOn(wechatContentSafetyGateway, "checkText");
  const app = Fastify(); errorHandler(app);
  let selectedActor = actor;
  app.addHook("onRequest", async request => { request.user = selectedActor; });
  controller.registerExtraRoutes(app);
  const url = `/project_logs/${id}/internal-comments`;
  try {
    for (const status of ["approved", "pending"] as const) {
      moderation.mockResolvedValue({ status, traceId: "secret-trace" });
      const response = await app.inject({ method: "POST", url, payload: { content: "内部记录" } });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({ moderation_status: status, published: status === "approved", visibility: "internal" });
      expect(response.body).not.toContain("secret-trace");
      expect(response.body).not.toContain("bound");
      if (status === "pending") expect(response.json().data.content).toBeUndefined();
    }
    moderation.mockResolvedValue({ status: "rejected", traceId: "trace" });
    const rejected = await app.inject({ method: "POST", url, payload: { content: "风险文本" } });
    expect(rejected.statusCode).toBe(422); expect(rejected.json().code).toBe("CONTENT_REJECTED");
    moderation.mockRejectedValue(Errors.business(503, "暂时无法审核，请稍后重试", "CONTENT_CHECK_UNAVAILABLE"));
    expect((await app.inject({ method: "POST", url, payload: { content: "正常文本" } })).json().code).toBe("CONTENT_CHECK_UNAVAILABLE");
    expect((await app.inject({ method: "POST", url, payload: { content: "图片", images: ["old.jpg"] } })).json().code).toBe("COMMENT_MEDIA_DISABLED");
    expect((await app.inject({ method: "POST", url, payload: { content: "绕过", moderation_status: "approved" } })).statusCode).toBe(400);
    expect((await app.inject({ url: `${url}?pageSize=101` })).statusCode).toBe(400);
    expect((await app.inject({ url })).json().data).toMatchObject({ list: [], total: 0, page: 1, pageSize: 20 });
    expect((await app.inject({ method: "PATCH", url, payload: { content: "编辑" } })).statusCode).toBe(404);
    for (const roles of [["customer"], ["visitor"]]) {
      selectedActor = { ...actor, roles };
      expect((await app.inject({ url })).statusCode).toBe(403);
      expect((await app.inject({ method: "POST", url, payload: { content: "越权" } })).statusCode).toBe(403);
    }
  } finally { await app.close(); }
});

test("real authentication rejects anonymous access to both internal routes", async () => {
  const { default: Fastify } = await import("fastify");
  const { default: authPlugin } = await import("@/plugins/auth");
  const { default: controller } = await import("@/controllers/project-log-comments");
  const app = Fastify(); authPlugin(app); controller.registerExtraRoutes(app);
  try {
    expect((await app.inject({ url: `/project_logs/${id}/internal-comments` })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: `/project_logs/${id}/internal-comments`, payload: { content: "内部记录" } })).statusCode).toBe(401);
  } finally { await app.close(); }
});
