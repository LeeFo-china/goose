import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type { ProjectCommentRow } from "./project-log-project-comments";

export interface ProjectCommentV2Row extends Omit<ProjectCommentRow, "moderation_status"> {
  moderation_status: "approved" | "pending" | "unchecked";
  published: boolean;
}
export interface ProjectCommentV2Insert {
  tenantId: string; logId: string; authUserId: string;
  authorType: "employee" | "customer"; authorId: string;
  content: string; parentId: string | null; attachmentIds: string[];
  clientRequestId: string; payloadSha256: string;
}
export interface ProjectCommentCursor { createdAt: string; id: string }
export interface ProjectCommentPage { list: ProjectCommentV2Row[]; total: number; hasMore: boolean }
export interface ProjectCommentPreview { log_id: string; total: number; recent_comments: ProjectCommentV2Row[] }
export interface ProjectCommentLogScope { tenantId: string; projectId: string; logIds: string[] }
const FIELDS = "id,log_id,parent_id,author_type,employee_author_id,customer_author_id,content,moderation_status,published,created_at";

export function assertCommentBatch(ids: string[], max: number): void {
  if (ids.length > max) throw Errors.badRequest(`一次最多查询 ${max} 个记录`);
}
export function throwCommentRpcError(error: { code?: string; message?: string }): never {
  if (error.code === "PT429") throw Errors.business(429, "图片上传频率或未提交数量超限，请稍后重试", "COMMENT_ATTACHMENT_RATE_LIMITED");
  if (error.code === "PT409") throw Errors.business(409, "请求标识已用于不同评论", "COMMENT_REQUEST_CONFLICT");
  if (error.code === "PT403") throw Errors.forbidden();
  if (error.code === "23514" || error.code === "PT400" || error.code === "22023") {
    throw Errors.badRequest("评论内容、附件或日志范围无效");
  }
  throw Errors.dbError("项目评论数据操作失败", error);
}

export class ProjectLogProjectCommentsV2Repository {
  async createV2(input: ProjectCommentV2Insert): Promise<ProjectCommentV2Row> {
    const { data, error } = await SupabaseDB.getAdminClient().rpc("create_project_log_project_comment_v2", {
      p_tenant_id: input.tenantId, p_log_id: input.logId, p_auth_user_id: input.authUserId,
      p_author_type: input.authorType, p_author_id: input.authorId, p_content: input.content,
      p_parent_id: input.parentId, p_attachment_ids: input.attachmentIds,
      p_client_request_id: input.clientRequestId, p_payload_sha256: input.payloadSha256,
    }).single<ProjectCommentV2Row>();
    if (error) throwCommentRpcError(error);
    if (!data) throw Errors.dbError("保存项目评论未返回结果");
    return data;
  }

  async listPublished(input: { tenantId: string; logId: string; pageSize: number; before?: ProjectCommentCursor }): Promise<ProjectCommentPage> {
    if (!Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) throw Errors.badRequest("每页评论数量必须为 1 至 100");
    // Pass the original timestamp unchanged: Date.toISOString would lose PG microseconds.
    const { data, error } = await SupabaseDB.getAdminClient().rpc("list_project_log_project_comments_v2", {
      p_tenant_id: input.tenantId, p_log_id: input.logId, p_page_size: input.pageSize,
      p_before_created_at: input.before?.createdAt ?? null, p_before_id: input.before?.id ?? null,
    });
    if (error) throwCommentRpcError(error);
    if (!data) throw Errors.dbError("查询项目评论未返回结果");
    return data as ProjectCommentPage;
  }

  async findLogsForProject(input: ProjectCommentLogScope): Promise<Array<{ id: string; tenant_id: string; project_id: string }>> {
    assertCommentBatch(input.logIds, 20);
    const ids = [...new Set(input.logIds)];
    if (!ids.length) return [];
    const { data, error } = await SupabaseDB.getAdminClient().from("project_logs")
      .select("id,tenant_id,project_id").eq("tenant_id", input.tenantId).eq("project_id", input.projectId)
      .in("id", ids).limit(20).returns<Array<{ id: string; tenant_id: string; project_id: string }>>();
    if (error) throw Errors.dbError("查询日志所属项目失败", error);
    if (!data || data.length !== ids.length) throw Errors.badRequest("日志不存在或不属于当前项目");
    return data;
  }

  async listPreviews(input: ProjectCommentLogScope): Promise<ProjectCommentPreview[]> {
    assertCommentBatch(input.logIds, 20);
    if (!input.logIds.length) return [];
    // Auxiliary request is explicitly bounded to 20 logs; SQL validates all IDs before counting.
    const { data, error } = await SupabaseDB.getAdminClient().rpc("preview_project_log_project_comments_v2", {
      p_tenant_id: input.tenantId, p_project_id: input.projectId, p_log_ids: [...new Set(input.logIds)],
    });
    if (error) throwCommentRpcError(error);
    return (data ?? []) as ProjectCommentPreview[];
  }

  async listPublishedParents(input: { tenantId: string; logIds: string[]; commentIds: string[] }): Promise<ProjectCommentV2Row[]> {
    assertCommentBatch(input.commentIds, 100);
    assertCommentBatch(input.logIds, 20);
    if (!input.commentIds.length || !input.logIds.length) return [];
    const { data, error } = await SupabaseDB.getAdminClient().from("project_log_project_comments")
      .select(FIELDS).eq("tenant_id", input.tenantId).eq("published", true)
      .in("log_id", input.logIds).in("id", [...new Set(input.commentIds)]).limit(100).returns<ProjectCommentV2Row[]>();
    if (error) throw Errors.dbError("查询回复对象失败", error);
    return data ?? [];
  }
}
