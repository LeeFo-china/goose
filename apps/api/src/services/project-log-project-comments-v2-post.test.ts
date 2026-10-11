import { expect, spyOn, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { Errors } from "@/errors/error-factory";
import type { ProjectCommentAttachmentRow } from "@/repositories/project-log-comment-attachments";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("successful v2 image reply POST runs service/RPC/serializer and returns only public response fields", async () => {
  const { default: Fastify } = await import("fastify");
  const { default: errorHandler } = await import("@/plugins/error-handler");
  const { default: controller } = await import("@/controllers/project-log-comments");
  const { SupabaseDB } = await import("@/utils/supabase");
  const { projectLogCommunicationRollout } = await import("./project-log-communication-rollout");
  const { projectLogCommunicationAccess } = await import("./project-log-communication-access");
  const { projectLogCommentAttachmentStorage } = await import("./project-log-comment-attachments");
  const { wechatContentSafetyGateway } = await import("./wechat-content-safety-gateway");
  const tenantId = id(1), logId = id(2), authorId = id(3), authUserId = id(4), commentId = id(5), fileId = id(6), parentId = id(7);
  const timestamp = "2026-10-11T00:00:00.123456+00:00";
  const prefix = `private/project-log-project-comments/${tenantId}/${logId}/${id(8)}`;
  const row = { id: commentId, log_id: logId, author_type: "employee", employee_author_id: authorId,
    customer_author_id: null, content: "", parent_id: parentId, created_at: timestamp, moderation_status: "unchecked", published: true,
    auth_user_id: authUserId, tenant_id: tenantId, payload_sha256: "private-payload-hash" };
  const attachment: ProjectCommentAttachmentRow = {
    file_id: fileId, tenant_id: tenantId, log_id: logId, auth_user_id: authUserId, author_type: "employee", author_id: authorId,
    status: "attached", comment_id: commentId, position: 0, created_at: timestamp, upload_expires_at: timestamp,
    file: { id: fileId, tenant_id: tenantId, owner_type: "project_log", owner_id: logId, scene: "project_log_project_comment",
      provider: "tencent_cos", bucket: "comments-123", region: "ap-guangzhou", object_key: `${prefix}/final/${"a".repeat(64)}`,
      mime_type: "image/png", size_bytes: 120, width: 8, height: 6, checksum: "a".repeat(64), visibility: "private",
      public_url: null, status: "active", deleted_at: null, created_by_auth_user_id: authUserId,
      metadata: { raw_object_key: `${prefix}/raw`, upload_status: "uploaded", upload_verified: true } },
  };
  const requests: Request[] = [];
  const client = createClient("http://127.0.0.1:1", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path.endsWith("/project_logs")) return Response.json({ id: logId, tenant_id: tenantId, project_id: id(9) });
      if (path.endsWith("/rpc/create_project_log_project_comment_v2")) return Response.json(row);
      if (path.endsWith("/project_log_project_comments")) return Response.json([{ ...row, id: parentId, content: "请确认", parent_id: null }]);
      if (path.endsWith("/project_log_comment_uploads")) return Response.json([attachment]);
      if (path.endsWith("/employees")) return Response.json([{ id: authorId, name: "工程师" }]);
      throw Errors.badRequest(`意外测试请求 ${path}`);
    }, { preconnect: () => undefined }) },
  });
  const stubs = [
    spyOn(SupabaseDB, "getAdminClient").mockReturnValue(client),
    spyOn(projectLogCommunicationRollout, "assertContract").mockResolvedValue(),
    spyOn(projectLogCommunicationRollout, "assertProjectAvailable").mockResolvedValue(),
    spyOn(projectLogCommunicationAccess, "resolve").mockResolvedValue({ tenantId, type: "employee", author: { id: authorId, name: "工程师" }, canWrite: true }),
  ];
  const signed = spyOn(projectLogCommentAttachmentStorage, "signReads").mockResolvedValue([{ url: "https://signed.example/preview", expiresAt: "2026-10-11T00:05:00Z" }]);
  const moderation = spyOn(wechatContentSafetyGateway, "checkText").mockRejectedValue(Errors.business(503, "检测不可用", "CONTENT_CHECK_UNAVAILABLE"));
  const app = Fastify();
  errorHandler(app);
  app.addHook("onRequest", async request => { request.user = { sub: authUserId, tenant_id: tenantId, employee_id: authorId, roles: ["employee"], login_channel: "admin_web" }; });
  controller.registerExtraRoutes(app);
  try {
    const result = await app.inject({ method: "POST", url: `/project_logs/${logId}/project-comments`,
      payload: { contract_version: 2, client_request_id: id(10), content: " ", parent_id: parentId, attachment_ids: [fileId] } });
    expect(result.statusCode).toBe(200);
    expect(result.json().data).toEqual({ id: commentId, log_id: logId, parent_id: parentId, author_type: "employee", author_id: authorId,
      author: { id: authorId, name: "工程师" }, content: "", created_at: timestamp, published: true, visibility: "project",
      attachments: [{ file_id: fileId, url: "https://signed.example/preview", expires_at: "2026-10-11T00:05:00Z", width: 8, height: 6, mime_type: "image/png" }],
      reply_to: { id: parentId, author_type: "employee", author_id: authorId, author: { id: authorId, name: "工程师" }, content: "请确认" } });
    const rpcRequests = requests.filter(request => request.url.includes("/rpc/"));
    expect(rpcRequests).toHaveLength(1);
    expect(await rpcRequests[0]!.json()).toMatchObject({ p_auth_user_id: authUserId, p_author_type: "employee", p_author_id: authorId,
      p_content: "", p_parent_id: parentId, p_attachment_ids: [fileId], p_payload_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(signed).toHaveBeenCalledTimes(1);
    expect(moderation).not.toHaveBeenCalled();
    for (const field of ["moderation_status", "auth_user_id", "payload_sha256", "object_key", "metadata", "bucket", "comment_id"]) expect(result.body).not.toContain(`"${field}"`);
  } finally {
    await app.close();
    moderation.mockRestore();
    signed.mockRestore();
    stubs.forEach(stub => stub.mockRestore());
  }
});
