import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "./authorization";

process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test-publish";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role";
const id = "00000000-0000-4000-8000-000000000001";
const context = { tenantId: id, employeeId: id } as AuthContext;
const authOptions = { tenantServiceAccess: "read", requiredCapability: null } as const;
const disabled = { statusCode: 403, code: "COMMENT_COMMUNICATION_DISABLED", message: "交流功能暂未开放" };
afterEach(() => mock.restore());

test("all consumer comment services reject text, replies, images and reads before repository access", async () => {
  const { projectLogCommentsService: logs } = await import("./project-log-comments");
  const { customerFollowUpCommentService: followUps } = await import("./customer-follow-up-comments");
  const { visitorPictureLibraryService: pictures } = await import("./visitor-picture-library");
  const { customerSelfServiceService: customers } = await import("./customer-self-service");
  const fetch = spyOn(globalThis, "fetch").mockRejectedValue(Errors.dbError("Unexpected network access"));
  const calls: Array<() => unknown> = [
    () => logs.createComment({ ...authOptions, authUserId: id, tokenRoles: ["employee"], payload: { log_id: id, content: "文字", images: [] } }),
    () => logs.createComment({ ...authOptions, authUserId: id, tokenRoles: ["customer"], payload: { log_id: id, parent_id: id, content: "回复", images: ["public/image.jpg"] } }),
    () => logs.listComments({ ...authOptions, authUserId: id, tokenRoles: ["employee"], logId: id }),
    () => followUps.createComment(context, { followUpId: id, payload: { content: "回复", parent_id: id, images: [] } }),
    () => followUps.listComments(context, { followUpId: id, page: 1, pageSize: 20 }),
    () => pictures.createComment({ assetId: id, visitorId: id, body: { content: "图片评论", image_file_ids: [id] } }),
    () => pictures.listComments(id, { page: 1, pageSize: 20, debug_timing: false }),
    () => customers.listProjectLogComments({ logId: id, tenantId: id, from: 0, to: 19 }),
  ];
  for (const call of calls) {
    await expect(Promise.resolve().then(call)).rejects.toMatchObject(disabled);
  }
  expect(fetch).not.toHaveBeenCalled();
});

test("follow-up previews and comment capabilities are suppressed without loading historical content", async () => {
  const { customerFollowUpCommentService } = await import("./customer-follow-up-comments");
  const fetch = spyOn(globalThis, "fetch").mockRejectedValue(Errors.dbError("Unexpected network access"));
  const rows = await customerFollowUpCommentService.enrichFollowUpsWithCommentSummaries(
    context, { owner_id: id }, [{ id, employee_id: id }],
  );
  expect(rows).toEqual([{ id, employee_id: id, comment_count: 0, latest_comment_preview: null,
    can_comment: false, can_view_comments: false, can_moderate_comments: false }]);
  expect(fetch).not.toHaveBeenCalled();
});

test("comment image upload, direct initialization, completion and re-registration stop before storage", async () => {
  const uploads = await import("./files/platform-file-storage/legacy/uploads");
  const direct = await import("./files/platform-file-storage/legacy/direct-upload");
  for (const scene of ["project_log_comment", "customer_follow_up_comment", "picture_comment"] as const) {
    const input = { scene, mimetype: "image/jpeg", buffer: Buffer.from("image"), sizeBytes: 5, objectKey: "public/picture-comment/a.jpg" };
    for (const fn of [uploads.uploadImage, uploads.uploadToTencentCos, uploads.uploadToSupabase,
      direct.createDirectUpload, direct.completeDirectUpload, direct.registerExistingCosObject]) {
      await expect(fn.call({}, input)).rejects.toMatchObject(disabled);
    }
  }
});

test("existing comment image public-url conversion is denied, including platform identity", async () => {
  const { resolveUploadPublicUrl } = await import("@/controllers/uploads/public-url");
  for (const isPlatformIdentity of [false, true]) {
    for (const path of [`tenants/${id}/project-log-comment/a.jpg`, `tenants/${id}/customer-follow-up-comment/a.jpg`, "public/picture-comment/a.jpg"]) {
      await expect(resolveUploadPublicUrl({ path }, { tenantId: id, isPlatformIdentity })).rejects.toMatchObject(disabled);
    }
  }
});

test("platform may not restore public comments, and permission checks still run", async () => {
  const { pictureLibraryService } = await import("./picture-library");
  const { platformAuthorizationService } = await import("./platform-authorization");
  const permission = spyOn(platformAuthorizationService, "assertPermission").mockImplementation(() => {});
  const fetch = spyOn(globalThis, "fetch").mockRejectedValue(Errors.dbError("Unexpected network access"));
  await expect(pictureLibraryService.showComment(id, { ...context, tenantId: null, isPlatformStaff: true })).rejects.toMatchObject(disabled);
  expect(permission).toHaveBeenCalledWith(expect.anything(), "platform.picture.manage");
  await expect(pictureLibraryService.showComment(id, context)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(fetch).not.toHaveBeenCalled();
});

test("customer and employee log summaries are empty without reading comment repositories", async () => {
  const { customerSelfServiceService } = await import("./customer-self-service");
  const { projectLogService } = await import("./project-logs");
  const fetch = spyOn(globalThis, "fetch").mockRejectedValue(Errors.dbError("Unexpected network access"));
  expect(await customerSelfServiceService.listProjectLogCommentAggregates({ tenantId: id, logIds: [id] })).toEqual([]);
  expect(await projectLogService.listProjectLogCommentSummaries({ authContext: context, logIds: [id] })).toEqual(new Map());
  expect(await projectLogService.listProjectLogCommentCounts({ authContext: context, logIds: [id] })).toEqual(new Map());
  expect(fetch).not.toHaveBeenCalled();
});

test("comment media file-id lookup cannot bypass the scene guard", async () => {
  const { uploadService } = await import("./uploads");
  const { platformFileObjectRepository } = await import("@/repositories/platform-file-objects");
  type FileRecord = NonNullable<Awaited<ReturnType<typeof platformFileObjectRepository.findActiveById>>>;
  const lookup = spyOn(platformFileObjectRepository, "findActiveById").mockResolvedValue({
    id, tenant_id: id, scene: "project_log_comment", visibility: "public", object_key: `tenants/${id}/project-log-comment/a.jpg`,
  } as FileRecord);
  await expect(uploadService.resolvePublicStoredFileUrlById({ fileObjectId: id, tenantId: id })).rejects.toMatchObject(disabled);
  expect(lookup).toHaveBeenCalledWith({ id, tenantId: id });
});

test("business image scenes remain available to existing storage permission checks", async () => {
  const { assertCommentMediaAvailable } = await import("./comment-communication");
  for (const scene of ["project_log", "project_acceptance", "wechat_pay_applyment", "picture_library", "customer_service"]) {
    expect(() => assertCommentMediaAvailable(scene)).not.toThrow();
  }
});

test("real routes serialize the disabled contract; absent edit routes cannot publish", async () => {
  const { default: Fastify } = await import("fastify");
  const { default: errorHandler } = await import("@/plugins/error-handler");
  const { default: comments } = await import("@/controllers/project-log-comments");
  const { default: pictures } = await import("@/controllers/visitor-picture-library");
  const app = Fastify();
  errorHandler(app);
  // Transport contract test: the separate test below retains the real auth plugin.
  app.addHook("onRequest", async request => { request.user = { sub: id, roles: ["employee"] }; });
  comments.registerExtraRoutes(app);
  pictures.registerExtraRoutes(app);
  try {
    for (const request of [
      { method: "GET" as const, url: `/project_log_comments?log_id=${id}` },
      { method: "POST" as const, url: "/project_log_comments", payload: { log_id: id, parent_id: id, content: "回复", images: [] } },
      { method: "GET" as const, url: `/visitor/picture-library/assets/${id}/comments?page=1&pageSize=20` },
    ]) {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(403);
      const body = response.json<{ success: boolean; code: string; message: string; requestId: string }>();
      expect(body).toEqual({ success: false, code: disabled.code, message: disabled.message, requestId: expect.any(String) });
    }
    expect((await app.inject({ method: "PATCH", url: `/project_log_comments/${id}`, payload: { content: "编辑" } })).statusCode).toBe(404);
  } finally { await app.close(); }
});

test("real authentication still rejects missing credentials before a protected comment route", async () => {
  const { default: Fastify } = await import("fastify");
  const { default: authPlugin } = await import("@/plugins/auth");
  const { default: comments } = await import("@/controllers/project-log-comments");
  const app = Fastify();
  authPlugin(app);
  comments.registerExtraRoutes(app);
  try {
    expect((await app.inject({ method: "POST", url: "/project_log_comments", payload: { log_id: id, content: "评论" } })).statusCode).toBe(401);
  } finally { await app.close(); }
});
