import { beforeAll, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "./authorization";
import type { JwtPayload } from "@/utils/jwt";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test-publish";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role";
let ProjectLogInternalCommentsService: typeof import("./project-log-internal-comments")["ProjectLogInternalCommentsService"];
beforeAll(async () => { ({ ProjectLogInternalCommentsService } = await import("./project-log-internal-comments")); });
import { InternalCommentCreateSchema, InternalCommentQuerySchema } from "@/schema/project-log-internal-comments";
const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const actor: JwtPayload = { sub: id, employee_id: id, tenant_id: id, roles: ["employee"], login_channel: "wechat", openid: "bound" };
const context = { authUserId: id, employeeId: id, tenantId: id, employeeStatus: "active", isPlatformAdmin: false } as AuthContext;
const payload = { content: "请复核施工记录" };
const input = { actor, logId: id, payload };
function setup(status: "approved" | "pending" | "rejected" = "approved") {
  const repository = {
    findLog: mock(async (): Promise<{ id: string; tenant_id: string; project_id: string } | null> => ({ id, tenant_id: id, project_id: id })),
    findActiveEmployee: mock(async (): Promise<{ id: string; name: string | null } | null> => ({ id, name: "施工员" })),
    findApprovedParent: mock(async (): Promise<{ id: string } | null> => ({ id })),
    create: mock(async () => ({ id, log_id: id, parent_id: null, author_id: id, content: payload.content,
      moderation_status: status === "pending" ? "pending" as const : "approved" as const, created_at: "2026-10-10T00:00:00Z" })),
    listApproved: mock(async () => ({ list: [], total: 0 })), listAuthors: mock(async () => [{ id, name: "施工员" }]),
  };
  const authorization = { getRequiredAuthContext: mock(async () => context) };
  const policy = { canAccessProject: mock(async () => true), canWriteProjectLog: mock(async () => true) };
  const identity = { findActiveOauthIdentity: mock(async () => ({ user_id: id })) };
  const moderation = { checkText: mock(async () => ({ status, traceId: "trace" })) };
  const rollout = { assertInternalAvailable: mock(async () => {}) };
  const service = new ProjectLogInternalCommentsService({ repository, authorization, policy, identity, moderation, rollout });
  return { service, repository, authorization, policy, identity, moderation, rollout };
}
test("approved employee comment is audited and internal only", async () => {
  const f = setup();
  expect(await f.service.create(input)).toMatchObject({ moderation_status: "approved", visibility: "internal", author: { id, name: "施工员" } });
  expect(f.moderation.checkText).toHaveBeenCalledWith({ openid: "bound", content: payload.content });
  expect(f.repository.create).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: id, author_id: id,
    moderation_status: "approved", moderation_trace_id: "trace", content_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  expect(f.authorization.getRequiredAuthContext).toHaveBeenCalledWith(id, { tenantServiceAccess: "write", requiredCapability: "core.projects", freshPermissions: true });
  expect(f.policy.canWriteProjectLog).toHaveBeenCalledTimes(2);
});
test("nonemployee and ambiguous roles never fall back to employee identity", async () => {
  for (const invalid of [undefined, { ...actor, roles: ["customer"] }, { ...actor, roles: ["visitor"] },
    { ...actor, roles: ["employee", "customer"] }, { ...actor, employee_id: null }]) {
    const f = setup();
    await expect(f.service.list({ actor: invalid, logId: id, page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: invalid ? 403 : 401 });
    expect(f.repository.listApproved).not.toHaveBeenCalled();
    expect(f.authorization.getRequiredAuthContext).not.toHaveBeenCalled();
  }
});
test("current tenant, employee, active employment and project access are required", async () => {
  for (const overrides of [{ tenantId: other }, { employeeId: other }, { employeeStatus: "inactive" }, { isPlatformAdmin: true }]) {
    const f = setup(); f.authorization.getRequiredAuthContext.mockResolvedValue({ ...context, ...overrides });
    await expect(f.service.create(input)).rejects.toMatchObject({ statusCode: 403 });
    expect(f.moderation.checkText).not.toHaveBeenCalled();
  }
  const f = setup(); f.repository.findLog.mockResolvedValue({ id, tenant_id: other, project_id: id });
  await expect(f.service.create(input)).rejects.toMatchObject({ statusCode: 403 });
  const g = setup(); g.policy.canAccessProject.mockResolvedValue(false);
  await expect(g.service.list({ actor, logId: id, page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 403 });
  const h = setup(); h.repository.findActiveEmployee.mockResolvedValue(null);
  await expect(h.service.create(input)).rejects.toMatchObject({ statusCode: 403 });
});
test("reply requires approved parent in same tenant and log", async () => {
  const f = setup(); f.repository.findApprovedParent.mockResolvedValue(null);
  await expect(f.service.create({ ...input, payload: { ...payload, parent_id: other } })).rejects.toMatchObject({ statusCode: 400 });
  expect(f.repository.findApprovedParent).toHaveBeenCalledWith({ parentId: other, logId: id, tenantId: id });
  expect(f.moderation.checkText).not.toHaveBeenCalled();
});
test("risky or unavailable content is not stored; review is nonpublished pending", async () => {
  const f = setup("rejected");
  await expect(f.service.create(input)).rejects.toMatchObject({ code: "CONTENT_REJECTED" });
  expect(f.repository.create).not.toHaveBeenCalled();
  const g = setup(); g.moderation.checkText.mockRejectedValue(Errors.business(503, "暂不可审核", "CONTENT_CHECK_UNAVAILABLE"));
  await expect(g.service.create(input)).rejects.toMatchObject({ code: "CONTENT_CHECK_UNAVAILABLE" });
  expect(g.repository.create).not.toHaveBeenCalled();
  const h = setup("pending");
  expect(await h.service.create(input)).toEqual({ id, moderation_status: "pending", visibility: "internal", published: false, code: "CONTENT_PENDING" });
  expect(h.repository.create).toHaveBeenCalledWith(expect.objectContaining({ moderation_status: "pending" }));
});
test("write access revoked during moderation prevents persistence", async () => {
  const f = setup(); f.policy.canWriteProjectLog.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(f.service.create(input)).rejects.toMatchObject({ statusCode: 403 });
  expect(f.repository.create).not.toHaveBeenCalled();
});
test("images and mismatched WeChat identity cannot bypass checking", async () => {
  const f = setup();
  await expect(f.service.create({ ...input, payload: { ...payload, images: ["https://example.org/a.jpg"] } })).rejects.toMatchObject({ code: "COMMENT_MEDIA_DISABLED" });
  expect(f.repository.create).not.toHaveBeenCalled();
  f.identity.findActiveOauthIdentity.mockResolvedValue({ user_id: other });
  await expect(f.service.create(input)).rejects.toMatchObject({ code: "CONTENT_CHECK_UNAVAILABLE" });
  expect(f.moderation.checkText).not.toHaveBeenCalled();
});
test("pagination is bounded and client cannot supply audit/identity fields", async () => {
  expect(InternalCommentQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  for (const query of [{ pageSize: 101 }, { page: 0 }, { page: 1.5 }]) expect(InternalCommentQuerySchema.safeParse(query).success).toBe(false);
  for (const field of ["author_id", "moderation_status", "openid", "rating"]) expect(InternalCommentCreateSchema.safeParse({ ...payload, [field]: id }).success).toBe(false);
  const f = setup();
  expect(await f.service.list({ actor, logId: id, page: 2, pageSize: 20 })).toMatchObject({ list: [], total: 0, page: 2, pageSize: 20 });
  expect(f.repository.listApproved).toHaveBeenCalledWith({ tenantId: id, logId: id, from: 20, to: 39 });
  expect(f.authorization.getRequiredAuthContext).toHaveBeenCalledWith(id, { tenantServiceAccess: "read", requiredCapability: "core.projects", freshPermissions: true });
});

test("retired internal endpoints cannot read history or create records", async () => {
  const f = setup();
  f.rollout.assertInternalAvailable.mockRejectedValue(Errors.business(410, "功能已调整，请更新小程序", "PROJECT_LOG_INTERNAL_COMMENTS_RETIRED"));
  await expect(f.service.list({actor,logId:id,page:1,pageSize:20})).rejects.toMatchObject({statusCode:410});
  await expect(f.service.create(input)).rejects.toMatchObject({code:"PROJECT_LOG_INTERNAL_COMMENTS_RETIRED"});
  expect(f.repository.listApproved).not.toHaveBeenCalled();
  expect(f.repository.create).not.toHaveBeenCalled();
});
