import { afterEach, expect, spyOn, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { SupabaseDB } from "@/utils/supabase";
import { ProjectLogCommentAttachmentsRepository } from "./project-log-comment-attachments";

const repository = new ProjectLogCommentAttachmentsRepository();
const restorers: Array<() => void> = [];
afterEach(() => restorers.splice(0).forEach(restore => restore()));
function stub(data: unknown | ((request: Request) => unknown), status = 200) {
  const requests: Request[] = [];
  const client = createClient("http://127.0.0.1:1", "test", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      requests.push(request);
      return Response.json(typeof data === "function" ? data(request) : data, { status });
    }, { preconnect: () => undefined }) },
  });
  const getter = spyOn(SupabaseDB, "getAdminClient").mockReturnValue(client);
  restorers.push(() => getter.mockRestore());
  return requests;
}
const scope = { fileId: "f", tenantId: "t", logId: "l", authUserId: "u", authorType: "employee" as const, authorId: "e" };

test("cleanup fails closed on malformed claim IDs", async () => {
  stub([{ file_id: "f", file: [] }]);
  await expect(repository.claimOrphans({ limit: 20 })).rejects.toMatchObject({ statusCode: 500 });
});
test("empty cleanup is valid and oversized claims fail before RPC", async () => {
  const requests = stub([]);
  await expect(repository.claimOrphans({ limit: 101 })).rejects.toMatchObject({ statusCode: 400 });
  expect(requests).toHaveLength(0);
  expect(await repository.claimOrphans({ limit: 20 })).toEqual([]);
  expect(await requests[0]!.json()).toEqual({ p_limit: 20 });
});
test("upload lookup binds tenant log auth user and selected author", async () => {
  const requests = stub([]);
  expect(await repository.findUpload(scope)).toBeNull();
  const params = new URL(requests[0]!.url).searchParams;
  for (const [name, value] of Object.entries({ file_id: "f", tenant_id: "t", log_id: "l", auth_user_id: "u", author_type: "employee", author_id: "e" })) {
    expect(params.get(name)).toBe(`eq.${value}`);
  }
});
test("complete sends verified content hash and final key through the atomic RPC", async () => {
  const requests = stub({ file_id: "f", status: "complete" });
  const verified = { mimeType: "image/png" as const, sizeBytes: 100, width: 2, height: 3, checksum: "a".repeat(64), objectKey: "private/final/"+"a".repeat(64) };
  await repository.completeUpload({ ...scope, verified });
  expect(new URL(requests[0]!.url).pathname).toEndWith("/rpc/complete_project_log_comment_upload");
  const body = await requests[0]!.json() as Record<string, unknown>;
  expect(body.p_auth_user_id).toBe("u");
  expect(body.p_verified).toEqual({ mime_type: "image/png", size_bytes: 100, width: 2, height: 3, checksum: verified.checksum, object_key: verified.objectKey });
});
test("attachment batch is bounded and excludes unpublished comments", async () => {
  const requests = stub([]);
  await expect(repository.listAttachments({ tenantId: "t", commentIds: Array.from({ length: 101 }, (_,i)=>String(i)) })).rejects.toMatchObject({ statusCode: 400 });
  expect(requests).toHaveLength(0);
  await repository.listAttachments({ tenantId: "t", commentIds: ["c"] });
  const params = new URL(requests[0]!.url).searchParams;
  expect(params.get("status")).toBe("eq.attached");
  expect(params.get("comment.published")).toBe("eq.true");
  expect(params.get("limit")).toBe("900");
});
test("claim ownership failures retain forbidden semantics", async () => {
  stub({ code: "PT403", message: "scope mismatch" }, 403);
  await expect(repository.completeUpload({ ...scope, verified: { mimeType: "image/png", sizeBytes: 100, width: 2, height: 3, checksum: "a".repeat(64), objectKey: "final" } })).rejects.toMatchObject({ statusCode: 403 });
});

test("claimed IDs load in one bounded table batch", async () => {
  const fileId = "00000000-0000-4000-8000-000000000401";
  const claimed = { file_id: fileId, status: "cleanup", file: { id: fileId } };
  const requests = stub((request: Request) => new URL(request.url).pathname.includes("/rpc/") ? [{ file_id: fileId }] : [claimed]);
  expect((await repository.claimOrphans({ limit: 20 })).map(row => row.file_id)).toEqual([fileId]);
  expect(requests).toHaveLength(2);
  const params = new URL(requests[1]!.url).searchParams;
  expect(params.get("file_id")).toBe(`in.(${fileId})`);
  expect(params.get("status")).toBe("eq.cleanup");
  expect(params.get("limit")).toBe("20");
});

test("reserve admission uses a single RPC before either metadata table is created", async () => {
  const requests = stub({ file_id: "f", upload_expires_at: "2026-10-11T12:10:00Z" });
  await repository.reserveUpload({ ...scope, bucket: "private", region: "ap-shanghai", objectKey: "scope/final", rawObjectKey: "scope/raw", mimeType: "image/png", sizeBytes: 512, originalName: "a.png" });
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]!.url).pathname).toEndWith("/rpc/reserve_project_log_comment_upload");
  const body = await requests[0]!.json() as Record<string, unknown>;
  expect(body.p_file_id).toBe("f");
  expect(body.p_auth_user_id).toBe("u");
  expect(body.p_author_id).toBe("e");
  expect(body.p_raw_object_key).toBe("scope/raw");
});
test("admission quota rejection maps to stable 429", async () => {
  stub({ code: "PT429", message: "COMMENT_ATTACHMENT_RATE_LIMITED" }, 429);
  await expect(repository.reserveUpload({ ...scope, bucket: "private", region: "ap-shanghai", objectKey: "scope/final", rawObjectKey: "scope/raw", mimeType: "image/png", sizeBytes: 512 }))
    .rejects.toMatchObject({ statusCode: 429, code: "COMMENT_ATTACHMENT_RATE_LIMITED" });
});
