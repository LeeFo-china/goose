import { expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { ProjectCommentV2Row } from "@/repositories/project-log-project-comments-v2";
import type { JwtPayload } from "@/utils/jwt";
import { decodeProjectCommentCursor } from "./project-log-comment-cursor";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenantId = id(1), projectId = id(2), authorId = id(3);
const actor: JwtPayload = { sub: id(4), tenant_id: tenantId, customer_id: authorId, roles: ["customer"], login_channel: "wechat", openid: "bound" };
const counts = [0, 1, 3, 4, 21];
const logIds = counts.map((_, n) => id(10 + n));
const payload = { contract_version: 2 as const, log_ids: logIds };
async function setup() {
  const { ProjectLogCommentPreviewsService } = await import("./project-log-comment-previews");
  const scopes = logIds.map(id => ({ id, tenant_id: tenantId, project_id: projectId }));
  const repository = {
    findLogsForProject: mock(async () => scopes),
    listPreviews: mock(async () => counts.map((total, n) => ({ log_id: logIds[n]!, total,
      recent_comments: Array.from({ length: Math.min(3, total) }, (_, i): ProjectCommentV2Row => ({
        id: id(100 + n * 30 + total - i), log_id: logIds[n]!, parent_id: i === 0 ? id(50) : null,
        author_type: "customer", customer_author_id: authorId, employee_author_id: null, content: String(total - i),
        published: true, moderation_status: "unchecked", created_at: "2026-10-11T00:00:00.123456+00:00",
      })),
    }))),
  };
  const session = { authorize: mock(async () => ({ context: { tenantId, type: "customer" as const, author: { id: authorId, name: null }, canWrite: false }, log: scopes[0]! })) };
  const serializer = { serialize: mock(async ({ rows }: { rows: ProjectCommentV2Row[] }) => rows.map(r => ({
    id: r.id, log_id: r.log_id, parent_id: r.parent_id, author_type: r.author_type, author_id: authorId,
    author: { id: authorId, name: null }, content: r.content, created_at: r.created_at,
    published: true as const, visibility: "project" as const, attachments: [], reply_to: null,
  }))) };
  return { repository, session, serializer, service: new ProjectLogCommentPreviewsService({ repository, session, serializer }) };
}

test("0/1/3/4/21 previews count replies and display latest three in ascending order", async () => {
  const f = await setup();
  const result = await f.service.list({ actor, projectId, payload });
  expect(result.list.map(p => p.total)).toEqual(counts);
  for (const [n, preview] of result.list.entries()) {
    const count = counts[n]!;
    expect(preview.recent_comments.map(r => r.content)).toEqual(Array.from({ length: Math.min(count, 3) }, (_, i) => String(Math.max(1, count - 2) + i)));
    expect(preview.can_write).toBe(false);
    expect(preview.has_more).toBe(count > 3);
    if (preview.older_cursor) expect(preview.recent_comments[0]?.id).toBe(decodeProjectCommentCursor(preview.older_cursor, preview.log_id).id);
    else expect(count).toBeLessThanOrEqual(3);
  }
  expect(f.repository.findLogsForProject).toHaveBeenCalledTimes(1);
  expect(f.session.authorize).toHaveBeenCalledTimes(1);
  expect(f.session.authorize).toHaveBeenCalledWith({ actor, logId: logIds[0], write: false });
  expect(f.repository.listPreviews).toHaveBeenCalledTimes(1);
  expect(f.serializer.serialize).toHaveBeenCalledTimes(1);
});

test("foreign, missing or wrong-tenant logs reject whole preview before reading counts/signing", async () => {
  for (const mode of ["foreign", "missing", "tenant"] as const) {
    const f = await setup();
    const logs = logIds.map(id => ({ id, tenant_id: tenantId, project_id: projectId }));
    if (mode === "missing") logs.pop();
    else if (logs[1]) logs[1] = { ...logs[1], ...(mode === "foreign" ? { project_id: id(999) } : { tenant_id: id(999) }) };
    f.repository.findLogsForProject.mockResolvedValue(logs);
    await expect(f.service.list({ actor, projectId, payload })).rejects.toMatchObject({ statusCode: 400 });
    expect(f.session.authorize).toHaveBeenCalledTimes(1);
    expect(f.repository.listPreviews).not.toHaveBeenCalled();
    expect(f.serializer.serialize).not.toHaveBeenCalled();
  }
});

test("preview has no cached access: current revocation prevents counts and signing on next request", async () => {
  const f = await setup();
  await f.service.list({ actor, projectId, payload });
  f.session.authorize.mockRejectedValue(Errors.forbidden());
  await expect(f.service.list({ actor, projectId, payload })).rejects.toMatchObject({ statusCode: 403 });
  expect(f.session.authorize).toHaveBeenCalledTimes(2);
  expect(f.repository.findLogsForProject).toHaveBeenCalledTimes(1);
  expect(f.repository.listPreviews).toHaveBeenCalledTimes(1);
  expect(f.serializer.serialize).toHaveBeenCalledTimes(1);
});

test("21 logs, duplicates and empty batches reject without I/O; current log movement fails closed", async () => {
  const f = await setup();
  for (const log_ids of [[], [id(10), id(10)], Array.from({ length: 21 }, (_, n) => id(100 + n))]) {
    await expect(f.service.list({ actor, projectId, payload: { ...payload, log_ids } })).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(f.repository.findLogsForProject).not.toHaveBeenCalled();
  f.session.authorize.mockResolvedValue({ context: { tenantId, type: "customer", author: { id: authorId, name: null }, canWrite: false }, log: { id: logIds[0]!, tenant_id: tenantId, project_id: id(999) } });
  await expect(f.service.list({ actor, projectId, payload })).rejects.toMatchObject({ statusCode: 403 });
  expect(f.repository.listPreviews).not.toHaveBeenCalled();
  expect(f.repository.findLogsForProject).not.toHaveBeenCalled();
});
