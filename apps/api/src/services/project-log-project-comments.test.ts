import { expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { ProjectCommentInsert, ProjectCommentRow } from "@/repositories/project-log-project-comments";
import type { JwtPayload } from "@/utils/jwt";
import type { ProjectCommunicationActor } from "./project-log-communication-access";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
const id = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
const actor: JwtPayload = { sub: id, tenant_id: id, customer_id: id, roles: ["customer"], login_channel: "wechat", openid: "bound" };
async function setup(status: "approved" | "pending" | "rejected" = "approved") {
  const { ProjectLogProjectCommentsService } = await import("./project-log-project-comments");
  const row = { id, log_id: id, parent_id: null, author_type: "customer" as const, employee_author_id: null, customer_author_id: id, content: "施工记录确认", moderation_status: "approved" as const, created_at: "2026-10-10T00:00:00Z" };
  const repository = { findLog: mock(async () => ({ id, tenant_id: id, project_id: id })), findApprovedParent: mock(async (): Promise<{
      id: string;
    } | null> => ({ id })), create: mock(async (input: ProjectCommentInsert): Promise<ProjectCommentRow> => ({ ...input, id, created_at: row.created_at })), listApproved: mock(async () => ({ list: [row], total: 1 })), listAuthors: mock(async () => [{ id, name: "业主", type: "customer" as const }]) };
  const access = { resolve: mock(async (): Promise<ProjectCommunicationActor> => ({ tenantId: id, type: "customer", author: { id, name: "业主" }, canWrite: true })) };
  const identity = { findActiveOauthIdentity: mock(async () => ({ user_id: id })) };
  const moderation = { checkText: mock(async () => ({ status, traceId: "private-trace" })) };
  const rollout = { assertProjectAvailable: mock(async () => { }) };
  const service = new ProjectLogProjectCommentsService({ repository, access, identity, moderation, rollout });
  return { service, repository, access, identity, moderation, rollout };
}
test("approved customer and employee text gets project visibility and exact author type", async () => {
  for (const type of ["customer", "employee"] as const) {
    const f = await setup();
    f.access.resolve.mockResolvedValue({ tenantId: id, type, author: { id, name: "姓名" }, canWrite: true });
    const result = await f.service.create({ actor, logId: id, payload: { content: "施工记录确认" } });
    expect(result).toMatchObject({ visibility: "project", published: true, author_type: type, author_id: id });
    expect(result).not.toHaveProperty("moderation_trace_id");
    expect(f.access.resolve).toHaveBeenCalledTimes(2);
    expect(f.identity.findActiveOauthIdentity).toHaveBeenCalledTimes(2);
    expect(f.repository.create).toHaveBeenCalledWith(expect.objectContaining({ author_type: type, employee_author_id: type === "employee" ? id : null, customer_author_id: type === "customer" ? id : null }));
  }
});
test("pending does not return body; rejection and unavailable never create", async () => {
  const f = await setup("pending");
  expect(await f.service.create({ actor, logId: id, payload: { content: "复核内容" } })).toMatchObject({ published: false, code: "CONTENT_PENDING", visibility: "project" });
  const g = await setup("rejected");
  await expect(g.service.create({ actor, logId: id, payload: { content: "拒绝" } })).rejects.toMatchObject({ code: "CONTENT_REJECTED" });
  expect(g.repository.create).not.toHaveBeenCalled();
  const h = await setup();
  h.moderation.checkText.mockRejectedValue(Errors.business(503, "暂不可审核", "CONTENT_CHECK_UNAVAILABLE"));
  await expect(h.service.create({ actor, logId: id, payload: { content: "异常" } })).rejects.toMatchObject({ code: "CONTENT_CHECK_UNAVAILABLE" });
  expect(h.repository.create).not.toHaveBeenCalled();
});
test("revocation or unbinding during moderation cannot persist", async () => {
  const f = await setup();
  f.access.resolve.mockResolvedValueOnce({ tenantId: id, type: "customer", author: { id, name: "业主" }, canWrite: true }).mockRejectedValueOnce(Errors.forbidden());
  await expect(f.service.create({ actor, logId: id, payload: { content: "记录" } })).rejects.toMatchObject({ statusCode: 403 });
  expect(f.repository.create).not.toHaveBeenCalled();
  const g = await setup();
  g.identity.findActiveOauthIdentity.mockResolvedValueOnce({ user_id: id }).mockResolvedValueOnce({ user_id: other });
  await expect(g.service.create({ actor, logId: id, payload: { content: "记录" } })).rejects.toMatchObject({ code: "CONTENT_CHECK_UNAVAILABLE" });
  expect(g.repository.create).not.toHaveBeenCalled();
});
test("invalid parent and images fail before moderation; forged state fails validation", async () => {
  const f = await setup();
  f.repository.findApprovedParent.mockResolvedValue(null);
  await expect(f.service.create({ actor, logId: id, payload: { content: "回复", parent_id: other } })).rejects.toMatchObject({ statusCode: 400 });
  await expect(f.service.create({ actor, logId: id, payload: { content: "图片", images: ["a.jpg"] } })).rejects.toMatchObject({ code: "COMMENT_MEDIA_DISABLED" });
  expect(f.moderation.checkText).not.toHaveBeenCalled();
  await expect(f.service.create({ actor, logId: id, payload: { content: "伪造", moderation_status: "approved" } as {
      content: string;
    } })).rejects.toMatchObject({ statusCode: 400 });
});
test("reply validates scoped parent twice and includes parent id", async () => {
  const f = await setup();
  await f.service.create({ actor, logId: id, payload: { content: "回复", parent_id: other } });
  expect(f.repository.findApprovedParent).toHaveBeenCalledTimes(2);
  expect(f.repository.findApprovedParent).toHaveBeenCalledWith({ tenantId: id, logId: id, parentId: other });
  expect(f.repository.create).toHaveBeenCalledWith(expect.objectContaining({ parent_id: other }));
});
test("paginated list exposes can_write and mapped authors only; flag blocks access", async () => {
  const f = await setup();
  f.access.resolve.mockResolvedValue({ tenantId: id, type: "customer", author: { id, name: "业主" }, canWrite: false });
  const result = await f.service.list({ actor, logId: id, page: 2, pageSize: 20 });
  expect(result).toMatchObject({ can_write: false, total: 1, page: 2, pageSize: 20, list: [{ visibility: "project", author_type: "customer", author_id: id }] });
  expect(result.list[0]).not.toHaveProperty("customer_author_id");
  expect(f.repository.listApproved).toHaveBeenCalledWith({ tenantId: id, logId: id, from: 20, to: 39 });
  await expect(f.service.list({ actor, logId: id, page: 1, pageSize: 101 })).rejects.toMatchObject({ statusCode: 400 });
  f.rollout.assertProjectAvailable.mockRejectedValue(Errors.business(403, "未开放", "COMMENT_COMMUNICATION_DISABLED"));
  await expect(f.service.list({ actor, logId: id, page: 1, pageSize: 20 })).rejects.toMatchObject({ code: "COMMENT_COMMUNICATION_DISABLED" });
});
test("legacy bound customer session without login_channel may publish", async () => {
  const f = await setup();
  expect(await f.service.create({ actor: { ...actor, login_channel: undefined }, logId: id, payload: { content: "客户记录" } })).toMatchObject({ published: true });
});
test("wechat unbinding prevents reading on next request despite shared auth cache", async () => {
  const f = await setup();
  f.identity.findActiveOauthIdentity.mockResolvedValue({ user_id: other });
  await expect(f.service.list({ actor, logId: id, page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 401 });
  expect(f.repository.listApproved).not.toHaveBeenCalled();
});
