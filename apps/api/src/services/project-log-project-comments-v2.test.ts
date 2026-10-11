import { expect, mock, spyOn, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { ProjectCommentV2Insert, ProjectCommentV2Row } from "@/repositories/project-log-project-comments-v2";
import type { JwtPayload } from "@/utils/jwt";
import type { ProjectCommunicationActor } from "./project-log-communication-access";
import { decodeProjectCommentCursor } from "./project-log-comment-cursor";

process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const logId = id(1), tenantId = id(2), authorId = id(3), authUserId = id(4);
const actor: JwtPayload = { sub: authUserId, tenant_id: tenantId, employee_id: authorId, roles: ["employee"], login_channel: "admin_web" };
const payload = { contract_version: 2 as const, client_request_id: id(5), content: "  图纸已确认  ", attachment_ids: [id(6), id(7)] };
function row(n: number): ProjectCommentV2Row {
  return { id: id(100 + n), log_id: logId, parent_id: null, author_type: "employee", employee_author_id: authorId,
    customer_author_id: null, content: String(n), moderation_status: "unchecked", published: true, created_at: "2026-10-11T00:00:00.123456+00:00" };
}
async function setup(count = 0) {
  const { ProjectLogProjectCommentsV2Service } = await import("./project-log-project-comments-v2");
  const rows = Array.from({ length: count }, (_, n) => row(count - n));
  const session = { authorize: mock(async (): Promise<{ context: ProjectCommunicationActor; log: { id: string; tenant_id: string; project_id: string } }> => ({
    context: { tenantId, type: "employee", author: { id: authorId, name: "工程师" }, canWrite: true },
    log: { id: logId, tenant_id: tenantId, project_id: id(8) },
  })) };
  const repository = {
    createV2: mock(async (input: ProjectCommentV2Insert) => ({ ...row(1), content: input.content, parent_id: input.parentId })),
    listPublished: mock(async (input: { pageSize: number; before?: { id: string } }) => {
      const eligible = rows.filter(r => !input.before || r.id < input.before.id);
      return { list: eligible.slice(0, input.pageSize), total: count, hasMore: eligible.length > input.pageSize };
    }),
  };
  const serializer = { serialize: mock(async ({ rows }: { rows: ProjectCommentV2Row[] }) => rows.map(r => ({
    id: r.id, log_id: r.log_id, parent_id: r.parent_id, author_type: r.author_type,
    author_id: r.employee_author_id, author: { id: authorId, name: "工程师" }, content: r.content,
    created_at: r.created_at, published: true as const, visibility: "project" as const, attachments: [], reply_to: null,
  }))) };
  return { service: new ProjectLogProjectCommentsV2Service({ session, repository, serializer }), session, repository, serializer };
}

test("atomic create normalizes content, uses selected author/auth user and returns published response", async () => {
  const f = await setup();
  const result = await f.service.create({ actor, logId, payload });
  expect(result).toMatchObject({ published: true, visibility: "project", content: "图纸已确认", author_id: authorId });
  expect(result).not.toHaveProperty("moderation_status");
  expect(f.session.authorize).toHaveBeenCalledWith({ actor, logId, write: true });
  expect(f.repository.createV2).toHaveBeenCalledWith(expect.objectContaining({ tenantId, logId, authUserId,
    authorType: "employee", authorId, content: "图纸已确认", parentId: null, attachmentIds: payload.attachment_ids, clientRequestId: payload.client_request_id }));
  expect(f.repository.createV2.mock.calls[0]?.[0].payloadSha256).toMatch(/^[0-9a-f]{64}$/);
});

test("idempotency hashes normalized payload and retains file order, parent and log distinctions", async () => {
  const f = await setup();
  for (const patch of [{}, { content: "图纸已确认", parent_id: null }, { attachment_ids: [...payload.attachment_ids].reverse() }, { parent_id: id(9) }]) {
    await f.service.create({ actor, logId, payload: { ...payload, ...patch } });
  }
  const hashes = f.repository.createV2.mock.calls.map(call => call[0].payloadSha256);
  expect(hashes[0]).toBe(hashes[1]);
  expect(hashes[2]).not.toBe(hashes[0]);
  expect(hashes[3]).not.toBe(hashes[0]);
  expect(f.session.authorize).toHaveBeenCalledTimes(4);
  await f.service.create({ actor, logId: id(10), payload });
  expect(f.repository.createV2.mock.calls[4]?.[0].payloadSha256).not.toBe(hashes[0]);
});

test("same-key retries reauthorize and current revocation blocks repository access", async () => {
  const f = await setup();
  await f.service.create({ actor, logId, payload });
  f.session.authorize.mockRejectedValue(Errors.forbidden());
  await expect(f.service.create({ actor, logId, payload })).rejects.toMatchObject({ statusCode: 403 });
  await expect(f.service.list({ actor, logId, contract_version: 2 })).rejects.toMatchObject({ statusCode: 403 });
  expect(f.repository.createV2).toHaveBeenCalledTimes(1);
  expect(f.repository.listPublished).not.toHaveBeenCalled();
});

test("validates content/image limits before mutation and supports image-only reply", async () => {
  const f = await setup();
  for (const patch of [{ content: " ", attachment_ids: [] }, { content: "x".repeat(501) },
    { attachment_ids: [id(6), id(6)] }, { attachment_ids: Array.from({ length: 10 }, (_, n) => id(20 + n)) }]) {
    await expect(f.service.create({ actor, logId, payload: { ...payload, ...patch } })).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(f.repository.createV2).not.toHaveBeenCalled();
  expect(await f.service.create({ actor, logId, payload: { ...payload, content: "", parent_id: id(9) } })).toMatchObject({ content: "", parent_id: id(9), published: true });
});

test("0/1/3/4/21 comments load newest page then display ascending and preserve cursor collision position", async () => {
  for (const count of [0, 1, 3, 4, 21]) {
    const f = await setup(count);
    const result = await f.service.list({ actor, logId, contract_version: 2 });
    expect(result).toMatchObject({ total: count, pageSize: 20, has_more: count > 20, can_write: true });
    expect(result.list.map(r => r.id)).toEqual(Array.from({ length: Math.min(count, 20) }, (_, n) => row(Math.max(1, count - 19) + n).id));
    if (result.next_cursor) {
      expect(decodeProjectCommentCursor(result.next_cursor, logId)).toEqual({ createdAt: row(2).created_at, id: row(2).id });
      const next = await f.service.list({ actor, logId, contract_version: 2, before: result.next_cursor });
      expect(next.list.map(r => r.id)).toEqual([row(1).id]);
      expect(next.has_more).toBe(false);
      expect(next.next_cursor).toBeNull();
    } else expect(count).toBeLessThanOrEqual(20);
  }
});

test("read-only list uses read authorization and rejects unbounded pages or foreign cursor", async () => {
  const f = await setup(4);
  f.session.authorize.mockResolvedValue({ context: { tenantId, type: "employee", author: { id: authorId, name: null }, canWrite: false }, log: { id: logId, tenant_id: tenantId, project_id: id(8) } });
  const result = await f.service.list({ actor, logId, contract_version: 2, pageSize: 3 });
  expect(result.can_write).toBe(false);
  expect(f.session.authorize).toHaveBeenCalledWith({ actor, logId, write: false });
  await expect(f.service.list({ actor, logId, contract_version: 2, pageSize: 101 })).rejects.toMatchObject({ statusCode: 400 });
  await expect(f.service.list({ actor, logId: id(9), contract_version: 2, before: result.next_cursor ?? "" })).rejects.toMatchObject({ statusCode: 400 });
  expect(f.repository.listPublished).toHaveBeenCalledTimes(1);
});

test("text and images publish without invoking the shared moderation gateway", async () => {
  const { wechatContentSafetyGateway } = await import("./wechat-content-safety-gateway");
  const check = spyOn(wechatContentSafetyGateway, "checkText").mockRejectedValue(Errors.business(503, "检测不可用", "CONTENT_CHECK_UNAVAILABLE"));
  try {
    const f = await setup();
    for (const patch of [{ attachment_ids: [] }, { content: "" }, {}]) {
      expect(await f.service.create({ actor, logId, payload: { ...payload, ...patch } })).toMatchObject({ published: true });
    }
    expect(check).not.toHaveBeenCalled();
  } finally {
    check.mockRestore();
  }
});

test("atomic repository rejects invalid parent/attachment or idempotency conflict before serialization", async () => {
  const f = await setup();
  for (const error of [Errors.badRequest("父评论不可用"), Errors.forbidden(), Errors.business(409, "请求冲突", "COMMENT_REQUEST_CONFLICT")]) {
    f.repository.createV2.mockRejectedValue(error);
    await expect(f.service.create({ actor, logId, payload })).rejects.toMatchObject({ statusCode: error.statusCode, code: error.code });
  }
  expect(f.serializer.serialize).not.toHaveBeenCalled();
});
