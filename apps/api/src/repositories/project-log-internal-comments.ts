import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const FIELDS = "id, log_id, parent_id, author_id, content, moderation_status, created_at";
export type InternalCommentRow = {
  id: string;
  log_id: string;
  parent_id: string | null;
  author_id: string;
  content: string;
  moderation_status: "approved" | "pending";
  created_at: string;
};
export type InternalCommentInsert = Omit<InternalCommentRow, "id" | "created_at"> & {
  tenant_id: string;
  moderation_trace_id: string;
  moderated_at: string;
  content_sha256: string;
};

class ProjectLogInternalCommentsRepository {
  async findLog(logId: string) {
    const { data, error } = await SupabaseDB.getAdminClient().from("project_logs")
      .select("id, tenant_id, project_id").eq("id", logId).maybeSingle<{
        id: string; tenant_id: string | null; project_id: string;
      }>();
    if (error) throw Errors.dbError("查询施工日志失败", error);
    return data;
  }

  async findActiveEmployee(input: { employeeId: string; tenantId: string; userId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient().from("employees")
      .select("id, name").eq("id", input.employeeId).eq("tenant_id", input.tenantId)
      .eq("user_id", input.userId).eq("status", "active")
      .maybeSingle<{ id: string; name: string | null }>();
    if (error) throw Errors.dbError("查询内部评论员工身份失败", error);
    return data;
  }

  async findApprovedParent(input: { parentId: string; tenantId: string; logId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient().from("project_log_internal_comments")
      .select("id").eq("id", input.parentId).eq("tenant_id", input.tenantId)
      .eq("log_id", input.logId).eq("moderation_status", "approved").maybeSingle<{ id: string }>();
    if (error) throw Errors.dbError("查询内部父评论失败", error);
    return data;
  }

  async create(payload: InternalCommentInsert) {
    const { data, error } = await SupabaseDB.getAdminClient().from("project_log_internal_comments")
      .insert(payload).select(FIELDS).single<InternalCommentRow>();
    if (error || !data) throw Errors.dbError("保存内部评论失败", error);
    return data;
  }

  async listApproved(input: { tenantId: string; logId: string; from: number; to: number }) {
    const { data, error, count } = await SupabaseDB.getAdminClient().from("project_log_internal_comments")
      .select(FIELDS, { count: "exact" }).eq("tenant_id", input.tenantId)
      .eq("log_id", input.logId).eq("moderation_status", "approved")
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(input.from, input.to);
    if (error) throw Errors.dbError("查询内部评论失败", error);
    return { list: (data ?? []) as InternalCommentRow[], total: count ?? 0 };
  }

  async listAuthors(input: { tenantId: string; employeeIds: string[] }) {
    if (input.employeeIds.length === 0) return [];
    // IDs come from one bounded comment page (at most 100), one batch rather than N+1.
    const { data, error } = await SupabaseDB.getAdminClient().from("employees")
      .select("id, name").eq("tenant_id", input.tenantId)
      .in("id", [...new Set(input.employeeIds)]).limit(100);
    if (error) throw Errors.dbError("查询内部评论作者失败", error);
    return (data ?? []) as Array<{ id: string; name: string | null }>;
  }
}
export const projectLogInternalCommentsRepository = new ProjectLogInternalCommentsRepository();
