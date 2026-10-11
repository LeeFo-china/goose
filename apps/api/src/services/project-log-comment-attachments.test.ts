import { expect, mock, spyOn, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { ProjectCommentAttachmentRow, ProjectCommentUploadScope } from "@/repositories/project-log-comment-attachments";
import type { JwtPayload } from "@/utils/jwt";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const actor: JwtPayload = { sub: id, tenant_id: id, customer_id: id, roles: ["customer"] };
const prefix = `private/project-log-project-comments/${id}/${id}/${other}`;
const initPayload = { contract_version: 2 as const, mime_type: "image/png" as const, size_bytes: 120 };
const completeInput = { actor, logId: id, payload: { contract_version: 2 as const, file_id: id } };
async function fixture() {
  const module = await import("./project-log-comment-attachments");
  const file = { id, tenant_id: id, owner_type: "project_log", owner_id: id, scene: "project_log_project_comment", visibility: "private", public_url: null,
    provider: "tencent_cos" as const, bucket: "comments-123", region: "ap-guangzhou", object_key: `${prefix}/final`, mime_type: "image/png", size_bytes: 120,
    width: null, height: null, checksum: null, metadata: { raw_object_key: `${prefix}/raw`, upload_status: "uploading" }, status: "active", deleted_at: null, created_by_auth_user_id: id };
  const row: ProjectCommentAttachmentRow = { file_id: id, tenant_id: id, log_id: id, auth_user_id: id, author_type: "customer", author_id: id,
    status: "uploading", comment_id: null, position: null, created_at: new Date().toISOString(), upload_expires_at: new Date(Date.now() + 300000).toISOString(), file };
  const verified = { mimeType: "image/png" as const, sizeBytes: 120, width: 8, height: 6, checksum: "a".repeat(64), etag: "a", objectKey: `${prefix}/final/${"a".repeat(64)}` };
  const repository = { reserveUpload: mock(async (scope: ProjectCommentUploadScope) => { row.file_id = scope.fileId; row.file.id = scope.fileId; return row; }), registerUpload: mock(async () => row), findUpload: mock(async (): Promise<ProjectCommentAttachmentRow | null> => row),
    completeUpload: mock(async () => { row.status = "complete"; Object.assign(row.file, { width: 8, height: 6, checksum: verified.checksum, object_key: verified.objectKey }); row.file.metadata.upload_verified = true; row.file.metadata.upload_status = "uploaded"; return row; }),
    findPublishedAttachment: mock(async (): Promise<ProjectCommentAttachmentRow | null> => row) };
  const session = { authorize: mock(async () => ({ context: { tenantId: id, type: "customer" as const, author: { id, name: "业主" }, canWrite: true }, log: { id, tenant_id: id, project_id: id } })) };
  const storage = { allocate: mock(async () => ({ bucket: file.bucket, region: file.region, objectKey: file.object_key, rawObjectKey: `${prefix}/raw` })),
    signPut: mock(async () => ({ uploadUrl: "signed-put", headers: { "x-cos-acl": "private" }, expiresAt: row.upload_expires_at })),
    finalize: mock(async () => verified), signRead: mock(async () => ({ url: "signed-get", expiresAt: row.upload_expires_at })), signReads: mock(async (locations: unknown[]) => locations.map(() => ({ url: "signed-get", expiresAt: row.upload_expires_at }))), remove: mock(async () => {}) };
  const service = new module.ProjectLogCommentAttachmentsService({ repository, session, storage });
  return { service, repository, session, storage, row, verified };
}
test("init binds private file to auth subject, selected identity and log", async () => {
  const f = await fixture();
  expect(await f.service.init({ actor, logId: id, payload: initPayload })).toMatchObject({ file_id: f.row.file_id, upload_url: "signed-put" });
  expect(f.session.authorize).toHaveBeenCalledWith({ actor, logId: id, write: true });
  expect(f.repository.reserveUpload).toHaveBeenCalledWith(expect.objectContaining({ fileId: f.row.file_id, tenantId: id, logId: id, authUserId: id, authorType: "customer", authorId: id }));
  expect(f.repository.reserveUpload).toHaveBeenCalledWith(expect.objectContaining({ bucket: f.row.file.bucket, region: f.row.file.region, objectKey: `${prefix}/final`, rawObjectKey: `${prefix}/raw`, mimeType: "image/png", sizeBytes: 120 }));
  expect(f.repository.registerUpload).not.toHaveBeenCalled();
});
test("complete reauthorizes after freeze and records verified metadata; retry does not rewrite", async () => {
  const f = await fixture();
  expect(await f.service.complete(completeInput)).toMatchObject({ file_id: id, status: "complete" });
  expect(f.session.authorize).toHaveBeenCalledTimes(2);
  expect(f.repository.completeUpload).toHaveBeenCalledWith(expect.objectContaining({ verified: expect.objectContaining({ checksum: "a".repeat(64) }) }));
  await f.service.complete(completeInput);
  expect(f.storage.finalize).toHaveBeenCalledTimes(1);
});
test("revocation during verification, unowned file and expired upload cannot complete", async () => {
  for (const kind of ["revoked", "unowned", "expired"] as const) {
    const f = await fixture();
    if (kind === "revoked") f.storage.finalize.mockImplementation(async () => { f.session.authorize.mockRejectedValue(Errors.forbidden()); return f.verified; });
    if (kind === "unowned") f.row.auth_user_id = other;
    if (kind === "expired") f.row.upload_expires_at = "2000-01-01T00:00:00Z";
    await expect(f.service.complete(completeInput)).rejects.toBeDefined();
    expect(f.repository.completeUpload).not.toHaveBeenCalled();
  }
});
test("URL requires fresh access and linked published attachment; batch signing has no DB calls", async () => {
  const f = await fixture();
  f.repository.findPublishedAttachment.mockResolvedValueOnce(null);
  await expect(f.service.url({ actor, logId: id, commentId: id, fileId: id })).rejects.toMatchObject({ statusCode: 403 });
  expect(f.storage.signRead).not.toHaveBeenCalled();
  await f.service.complete(completeInput); f.row.status = "attached"; f.row.comment_id = id;
  expect(await f.service.url({ actor, logId: id, commentId: id, fileId: id })).toMatchObject({ file_id: id, url: "signed-get" });
  f.repository.findPublishedAttachment.mockClear(); f.repository.findUpload.mockClear();
  expect(await f.service.signAttachments({ tenantId: id, rows: [f.row] })).toHaveLength(1);
  expect(f.repository.findPublishedAttachment).not.toHaveBeenCalled(); expect(f.repository.findUpload).not.toHaveBeenCalled();
  await expect(f.service.signAttachments({ tenantId: other, rows: [f.row] })).rejects.toMatchObject({ statusCode: 403 });
});
test("orphan cleanup deletes only claimed expired unreferenced rows and leaves failed rows retryable", async () => {
  const module = await import("./project-log-comment-attachments");
  expect(module).toHaveProperty("runProjectCommentAttachmentCleanupTick");
  const f = await fixture(); f.row.status = "cleanup"; f.row.created_at = "2000-01-01T00:00:00Z"; f.row.upload_expires_at = "2000-01-01T00:05:00Z";
  const referenced = { ...f.row, file_id: other, status: "attached" as const, comment_id: id };
  const repository = { claimOrphans: mock(async () => [f.row, referenced]), finishOrphanCleanup: mock(async () => true) };
  f.storage.remove.mockRejectedValueOnce(Errors.badRequest("upstream failure"));
  const run = () => module.runProjectCommentAttachmentCleanupTick({ enabled: true, apply: true }, { repository, storage: f.storage });
  expect(await run()).toMatchObject({ failed: 2, deleted: 0 });
  expect(repository.finishOrphanCleanup).not.toHaveBeenCalled();
  expect(await run()).toMatchObject({ deleted: 1 });
  expect(f.storage.remove).toHaveBeenCalledTimes(2);
  expect(await module.runProjectCommentAttachmentCleanupTick({ enabled: false, apply: true }, { repository, storage: f.storage })).toBeNull();
});
test("strict init/complete schemas reject keys, URLs, identity overrides and oversized claims", async () => {
  const f = await fixture();
  for (const payload of [{ ...initPayload, object_key: "private/forged" }, { ...initPayload, url: "https://x/x.png" }, { ...initPayload, author_id: other }, { ...initPayload, size_bytes: 10485761 }]) {
    await expect(f.service.init({ actor, logId: id, payload })).rejects.toMatchObject({ statusCode: 400 });
  }
  await expect(f.service.complete({ ...completeInput, payload: { ...completeInput.payload, object_key: "forged" } })).rejects.toMatchObject({ statusCode: 400 });
  expect(f.storage.signPut).not.toHaveBeenCalled(); expect(f.storage.finalize).not.toHaveBeenCalled();
});
test("published URL fails closed on inactive, public, wrong-scene or cross-log files", async () => {
  for (const field of ["visibility", "scene", "owner_id", "deleted_at", "tenant_id"] as const) {
    const f = await fixture(); await f.service.complete(completeInput); f.row.status = "attached"; f.row.comment_id = id;
    if (field === "deleted_at") f.row.file.deleted_at = new Date().toISOString();
    else f.row.file[field] = other;
    await expect(f.service.url({ actor, logId: id, commentId: id, fileId: id })).rejects.toMatchObject({ statusCode: 403 });
    expect(f.storage.signReads).not.toHaveBeenCalled();
  }
});
test("cleanup dry run never claims or deletes any row", async () => {
  const { runProjectCommentAttachmentCleanupTick } = await import("./project-log-comment-attachments");
  const repository = { claimOrphans: mock(async () => []), finishOrphanCleanup: mock(async () => true) };
  const storage = { remove: mock(async () => {}) };
  expect(await runProjectCommentAttachmentCleanupTick({ enabled: true, apply: false }, { repository, storage })).toBeNull();
  expect(repository.claimOrphans).not.toHaveBeenCalled(); expect(repository.finishOrphanCleanup).not.toHaveBeenCalled(); expect(storage.remove).not.toHaveBeenCalled();
});

test("admission quota rejects before any signed credentials or separate file creation", async () => {
  const f = await fixture();
  f.repository.reserveUpload.mockRejectedValue(Errors.business(429, "评论图片上传过于频繁", "COMMENT_ATTACHMENT_RATE_LIMITED"));
  await expect(f.service.init({ actor, logId: id, payload: initPayload })).rejects.toMatchObject({ statusCode: 429, code: "COMMENT_ATTACHMENT_RATE_LIMITED" });
  expect(f.repository.reserveUpload).toHaveBeenCalledTimes(1);
  expect(f.storage.signPut).not.toHaveBeenCalled();
  expect(f.repository.registerUpload).not.toHaveBeenCalled();
});
test("init reserves both records atomically before signing and returns no credential exceeding reservation", async () => {
  const f = await fixture();
  const events: string[] = [];
  f.repository.reserveUpload.mockImplementation(async (scope) => { events.push("reserve"); f.row.file_id = scope.fileId; return f.row; });
  f.storage.signPut.mockImplementation(async () => { events.push("sign"); return { uploadUrl: "signed-put", headers: { "x-cos-acl": "private" }, expiresAt: new Date(Date.parse(f.row.upload_expires_at) + 1000).toISOString() }; });
  await expect(f.service.init({ actor, logId: id, payload: initPayload })).rejects.toMatchObject({ code: "COMMENT_ATTACHMENT_UPLOAD_EXPIRED" });
  expect(events).toEqual(["reserve", "sign"]);
});
test("invalid or expired reservation never reaches signing", async () => {
  for (const kind of ["expired", "invalid", "other-identity", "other-log", "complete"] as const) {
    const f = await fixture();
    if (kind === "expired") f.row.upload_expires_at = "2000-01-01T00:00:00Z";
    if (kind === "invalid") f.row.upload_expires_at = "not-a-date";
    if (kind === "other-identity") f.row.author_id = other;
    if (kind === "other-log") f.row.log_id = other;
    if (kind === "complete") f.row.status = "complete";
    await expect(f.service.init({ actor, logId: id, payload: initPayload })).rejects.toBeDefined();
    expect(f.storage.signPut).not.toHaveBeenCalled();
  }
});
test("post-reservation signing failure or revoked session never returns credentials", async () => {
  const f = await fixture();
  f.storage.signPut.mockRejectedValue(Errors.business(502, "签名失败", "COMMENT_ATTACHMENT_STORAGE_FAILED"));
  await expect(f.service.init({ actor, logId: id, payload: initPayload })).rejects.toMatchObject({ statusCode: 502 });
  expect(f.repository.reserveUpload).toHaveBeenCalledTimes(1);
  expect(f.repository.registerUpload).not.toHaveBeenCalled();
  const g = await fixture();
  g.storage.signPut.mockImplementation(async () => {
    g.session.authorize.mockRejectedValue(Errors.forbidden());
    return { uploadUrl: "must-not-return", headers: { "x-cos-acl": "private" }, expiresAt: g.row.upload_expires_at };
  });
  await expect(g.service.init({ actor, logId: id, payload: initPayload })).rejects.toMatchObject({ statusCode: 403 });
  expect(g.repository.reserveUpload).toHaveBeenCalledTimes(1);
  expect(g.session.authorize).toHaveBeenCalledTimes(2);
});
test("issued credentials expiring during fresh authorization are not returned", async () => {
  const f = await fixture();
  const expiry = new Date(Date.now() + 300000).toISOString();
  const clock = spyOn(Date, "now");
  try {
    f.storage.signPut.mockResolvedValue({ uploadUrl: "must-not-return", headers: { "x-cos-acl": "private" }, expiresAt: expiry });
    f.session.authorize.mockImplementation(async () => {
      if (f.storage.signPut.mock.calls.length) clock.mockReturnValue(Date.parse(expiry) + 1000);
      return { context: { tenantId: id, type: "customer", author: { id, name: "业主" }, canWrite: true }, log: { id, tenant_id: id, project_id: id } };
    });
    await expect(f.service.init({ actor, logId: id, payload: initPayload })).rejects.toMatchObject({ code: "COMMENT_ATTACHMENT_UPLOAD_EXPIRED" });
  } finally { clock.mockRestore(); }
});
