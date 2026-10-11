import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import { assertCommentBatch, throwCommentRpcError } from "./project-log-project-comments-v2";

export interface ProjectCommentUploadScope {
  tenantId: string; logId: string; authUserId: string;
  authorType: "employee" | "customer"; authorId: string; fileId: string;
}
export interface ProjectCommentUploadReservation extends ProjectCommentUploadScope {
  bucket: string; region: string; objectKey: string; rawObjectKey: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp"; sizeBytes: number; originalName?: string;
}
export interface ProjectCommentUploadRow {
  file_id: string; tenant_id: string; log_id: string; auth_user_id: string;
  author_type: "employee" | "customer"; author_id: string;
  status: "uploading" | "complete" | "attached" | "cleanup";
  comment_id: string | null; position: number | null; created_at: string; upload_expires_at: string;
}
export interface ProjectCommentAttachmentFile {
  id: string; provider: "tencent_cos" | "supabase_storage"; bucket: string; region: string | null;
  object_key: string; mime_type: string; size_bytes: number; width: number | null; height: number | null;
  tenant_id: string | null; public_url: string | null; status: string; deleted_at: string | null; created_by_auth_user_id: string | null;
  checksum: string | null; metadata: Record<string, unknown>; visibility: string; scene: string;
  owner_type: string; owner_id: string | null;
}
export interface ProjectCommentAttachmentRow extends ProjectCommentUploadRow { file: ProjectCommentAttachmentFile }
export interface ProjectCommentVerifiedUpload {
  mimeType: "image/jpeg" | "image/png" | "image/webp"; sizeBytes: number;
  width: number; height: number; checksum: string; objectKey: string;
}
const UPLOAD_FIELDS = "file_id,tenant_id,log_id,auth_user_id,author_type,author_id,status,comment_id,position,created_at,upload_expires_at";
const FILE_FIELDS = "id,provider,bucket,region,object_key,mime_type,size_bytes,width,height,checksum,metadata,visibility,scene,owner_type,owner_id,tenant_id,public_url,status,deleted_at,created_by_auth_user_id";
const FIELDS = `${UPLOAD_FIELDS},file:platform_file_objects!inner(${FILE_FIELDS})`;

export class ProjectLogCommentAttachmentsRepository {
  async reserveUpload(input: ProjectCommentUploadReservation): Promise<ProjectCommentUploadRow> {
    const { data, error } = await SupabaseDB.getAdminClient().rpc("reserve_project_log_comment_upload", {
      p_file_id: input.fileId, p_tenant_id: input.tenantId, p_log_id: input.logId,
      p_auth_user_id: input.authUserId, p_author_type: input.authorType, p_author_id: input.authorId,
      p_bucket: input.bucket, p_region: input.region, p_object_key: input.objectKey, p_raw_object_key: input.rawObjectKey,
      p_mime_type: input.mimeType, p_size_bytes: input.sizeBytes, p_original_name: input.originalName ?? null,
    }).single<ProjectCommentUploadRow>();
    if (error) throwCommentRpcError(error);
    if (!data) throw Errors.dbError("预留评论图片上传失败");
    return data;
  }

  async registerUpload(input: ProjectCommentUploadScope & { uploadExpiresAt?: string }): Promise<ProjectCommentUploadRow> {
    const { data, error } = await SupabaseDB.getAdminClient().from("project_log_comment_uploads").insert({
      file_id: input.fileId, tenant_id: input.tenantId, log_id: input.logId, auth_user_id: input.authUserId,
      author_type: input.authorType, author_id: input.authorId,
      ...(input.uploadExpiresAt ? { upload_expires_at: input.uploadExpiresAt } : {}),
    }).select(UPLOAD_FIELDS).single<ProjectCommentUploadRow>();
    if (error) throwCommentRpcError(error);
    if (!data) throw Errors.dbError("登记评论图片失败");
    return data;
  }

  async findUpload(input: ProjectCommentUploadScope): Promise<ProjectCommentAttachmentRow | null> {
    const { data, error } = await SupabaseDB.getAdminClient().from("project_log_comment_uploads").select(FIELDS)
      .eq("file_id", input.fileId).eq("tenant_id", input.tenantId).eq("log_id", input.logId)
      .eq("auth_user_id", input.authUserId).eq("author_type", input.authorType).eq("author_id", input.authorId)
      .maybeSingle<ProjectCommentAttachmentRow>();
    if (error) throw Errors.dbError("查询评论图片归属失败", error);
    return data;
  }

  async completeUpload(input: ProjectCommentUploadScope & { verified: ProjectCommentVerifiedUpload }): Promise<ProjectCommentUploadRow> {
    const { data, error } = await SupabaseDB.getAdminClient().rpc("complete_project_log_comment_upload", {
      p_file_id: input.fileId, p_tenant_id: input.tenantId, p_log_id: input.logId, p_auth_user_id: input.authUserId,
      p_author_type: input.authorType, p_author_id: input.authorId,
      p_verified: { mime_type: input.verified.mimeType, size_bytes: input.verified.sizeBytes,
        width: input.verified.width, height: input.verified.height, checksum: input.verified.checksum, object_key: input.verified.objectKey },
    }).single<ProjectCommentUploadRow>();
    if (error) throwCommentRpcError(error);
    if (!data) throw Errors.dbError("完成评论图片上传失败");
    return data;
  }

  async listAttachments(input: { tenantId: string; commentIds: string[] }): Promise<ProjectCommentAttachmentRow[]> {
    assertCommentBatch(input.commentIds, 100);
    if (!input.commentIds.length) return [];
    // At most 100 comments * 9 attachments. This is a bounded association batch, not an unbounded list.
    const { data, error } = await SupabaseDB.getAdminClient().from("project_log_comment_uploads")
      .select(`${FIELDS},comment:project_log_project_comments!inner(published)`)
      .eq("tenant_id", input.tenantId).eq("status", "attached").eq("comment.published", true)
      .in("comment_id", [...new Set(input.commentIds)]).order("position").limit(900).returns<ProjectCommentAttachmentRow[]>();
    if (error) throw Errors.dbError("查询评论附件失败", error);
    return data ?? [];
  }

  async findPublishedAttachment(input: { tenantId: string; logId: string; commentId: string; fileId: string }): Promise<ProjectCommentAttachmentRow | null> {
    const { data, error } = await SupabaseDB.getAdminClient().from("project_log_comment_uploads")
      .select(`${FIELDS},comment:project_log_project_comments!inner(published)`)
      .eq("tenant_id", input.tenantId).eq("log_id", input.logId).eq("comment_id", input.commentId)
      .eq("file_id", input.fileId).eq("status", "attached").eq("comment.published", true).maybeSingle<ProjectCommentAttachmentRow>();
    if (error) throw Errors.dbError("查询可见评论附件失败", error);
    return data;
  }

  async finishOrphanCleanup(input: { fileId: string }): Promise<boolean> {
    const { data, error } = await SupabaseDB.getAdminClient().rpc("finish_project_log_comment_orphan", { p_file_id: input.fileId });
    if (error) throwCommentRpcError(error);
    return data === true;
  }

  async claimOrphans(input: { limit?: number } = {}): Promise<ProjectCommentAttachmentRow[]> {
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Errors.badRequest("清理数量必须为 1 至 100");
    const claim = await SupabaseDB.getAdminClient().rpc("claim_project_log_comment_orphans", { p_limit: limit });
    if (claim.error) throwCommentRpcError(claim.error);
    const parsed = z.array(z.object({ file_id: z.uuid() })).max(limit).safeParse(claim.data);
    if (!parsed.success) throw Errors.dbError("评论图片清理认领结果无效", parsed.error);
    if (!parsed.data.length) return [];
    // One bounded lookup after the atomic claim avoids ambiguous RPC relation inference.
    const { data, error } = await SupabaseDB.getAdminClient().from("project_log_comment_uploads")
      .select(FIELDS).in("file_id", parsed.data.map(row => row.file_id)).eq("status", "cleanup")
      .limit(limit).returns<ProjectCommentAttachmentRow[]>();
    if (error) throw Errors.dbError("读取已认领评论图片失败", error);
    return data ?? [];
  }
}
export const projectLogCommentAttachmentsRepository = new ProjectLogCommentAttachmentsRepository();
