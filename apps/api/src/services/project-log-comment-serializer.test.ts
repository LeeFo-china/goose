import { expect, mock, test } from "bun:test";
import type { ProjectCommentV2Row } from "@/repositories/project-log-project-comments-v2";
import type { ProjectCommentAuthor } from "@/repositories/project-log-project-comments";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function row(n: number, parent: number | null = null): ProjectCommentV2Row {
  return { id: id(n), log_id: id(1000), parent_id: parent === null ? null : id(parent), author_type: "customer",
    employee_author_id: null, customer_author_id: id(n + 1000), content: `内容${n}`, created_at: "2026-10-11T00:00:00.123456Z",
    published: true, moderation_status: "unchecked" };
}
async function setup(parents: ProjectCommentV2Row[] = []) {
  const { ProjectLogCommentSerializer } = await import("./project-log-comment-serializer");
  const repository = {
    listPublishedParents: mock(async () => parents),
    listAuthors: mock(async (input: { employeeIds: string[]; customerIds: string[] }): Promise<ProjectCommentAuthor[]> => [
      ...input.employeeIds.map(id => ({ id, type: "employee" as const, name: null })),
      ...input.customerIds.map(id => ({ id, type: "customer" as const, name: "业主" })),
    ]),
  };
  const attachments = { listAttachments: mock(async () => []) };
  const signer = { signAttachments: mock(async () => [{ comment_id: id(2), file_id: id(900), url: "https://private.example/signed", expires_at: "2026-10-11T00:05:00Z", width: 10, height: 20, mime_type: "image/png" }]) };
  return { serializer: new ProjectLogCommentSerializer({ repository, attachments, signer }), repository, attachments, signer };
}

test("resolves parent outside preview with batched authors and signs attachments once", async () => {
  const f = await setup([row(1)]);
  const result = await f.serializer.serialize({ tenantId: id(2000), rows: [row(2, 1), row(3, 1), row(4)] });
  expect(result[0]).toMatchObject({ author_id: id(1002), author: { name: "业主" }, published: true,
    reply_to: { id: id(1), content: "内容1", author: { name: "业主" } }, attachments: [{ file_id: id(900), mime_type: "image/png" }] });
  expect(result[0]).not.toHaveProperty("moderation_status");
  expect(result[0]?.attachments[0]).not.toHaveProperty("comment_id");
  expect(f.repository.listPublishedParents).toHaveBeenCalledTimes(1);
  expect(f.repository.listPublishedParents).toHaveBeenCalledWith({ tenantId: id(2000), logIds: [id(1000)], commentIds: [id(1)] });
  expect(f.repository.listAuthors).toHaveBeenCalledTimes(1);
  expect(f.attachments.listAttachments).toHaveBeenCalledTimes(1);
  expect(f.signer.signAttachments).toHaveBeenCalledTimes(1);
});

test("same-page parent needs no parent query; foreign or pending parents are never exposed", async () => {
  const f = await setup();
  const first = await f.serializer.serialize({ tenantId: id(2000), rows: [row(1), row(2, 1)] });
  expect(first[1]?.reply_to?.id).toBe(id(1));
  expect(f.repository.listPublishedParents).not.toHaveBeenCalled();
  f.repository.listPublishedParents.mockResolvedValue([{ ...row(1), log_id: id(999) }, { ...row(5), published: false, moderation_status: "pending" }]);
  const next = await f.serializer.serialize({ tenantId: id(2000), rows: [row(2, 1), row(3, 5)] });
  expect(next.map(r => r.reply_to)).toEqual([null, null]);
});

test("100 replies plus 100 off-page parents use two bounded author batches", async () => {
  const f = await setup(Array.from({ length: 100 }, (_, n) => row(n + 1)));
  await f.serializer.serialize({ tenantId: id(2000), rows: Array.from({ length: 100 }, (_, n) => row(n + 101, n + 1)) });
  expect(f.repository.listAuthors).toHaveBeenCalledTimes(2);
  for (const [input] of f.repository.listAuthors.mock.calls) expect(input.customerIds.length).toBeLessThanOrEqual(100);
  expect(f.repository.listPublishedParents).toHaveBeenCalledTimes(1);
  expect(f.attachments.listAttachments).toHaveBeenCalledTimes(1);
});

test("empty serialization does no I/O; unpublished legacy pending cannot be serialized", async () => {
  const f = await setup();
  expect(await f.serializer.serialize({ tenantId: id(2000), rows: [] })).toEqual([]);
  expect(f.repository.listAuthors).not.toHaveBeenCalled();
  expect(f.attachments.listAttachments).not.toHaveBeenCalled();
  await expect(f.serializer.serialize({ tenantId: id(2000), rows: [{ ...row(1), published: false, moderation_status: "pending" }] })).rejects.toMatchObject({ statusCode: 500 });
});
