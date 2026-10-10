import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import { projectLogInternalCommentsRepository } from "./project-log-internal-comments";

const FIELDS = "id, log_id, parent_id, author_type, employee_author_id, customer_author_id, content, moderation_status, created_at";
const MAX_PAGE_SIZE = 100;

export interface ProjectCommentRow {
  id: string;
  log_id: string;
  parent_id: string | null;
  author_type: "employee" | "customer";
  employee_author_id: string | null;
  customer_author_id: string | null;
  content: string;
  moderation_status: "approved" | "pending";
  created_at: string;
}

export type ProjectCommentInsert = Omit<ProjectCommentRow, "id" | "created_at"> & {
  tenant_id: string;
  moderation_trace_id: string;
  moderated_at: string;
  content_sha256: string;
};

export interface ProjectCommentAuthor {
  id: string;
  name: string | null;
  type: "employee" | "customer";
}

export class ProjectLogProjectCommentsRepository {
  async findLog(logId: string): Promise<{ id: string; tenant_id: string | null; project_id: string } | null> {
    return projectLogInternalCommentsRepository.findLog(logId);
  }

  async create(payload: ProjectCommentInsert): Promise<ProjectCommentRow> {
    const { data, error } = await SupabaseDB.getAdminClient().from("project_log_project_comments")
      .insert(payload).select(FIELDS).single<ProjectCommentRow>();
    if (error || !data) throw Errors.dbError("保存项目沟通评论失败", error);
    return data;
  }

  async findApprovedParent(input: { parentId: string; tenantId: string; logId: string }): Promise<{ id: string } | null> {
    const { data, error } = await SupabaseDB.getAdminClient().from("project_log_project_comments")
      .select("id").eq("id", input.parentId).eq("tenant_id", input.tenantId)
      .eq("log_id", input.logId).eq("moderation_status", "approved").maybeSingle<{ id: string }>();
    if (error) throw Errors.dbError("查询项目沟通父评论失败", error);
    return data;
  }

  async listApproved(input: { tenantId: string; logId: string; from: number; to: number }): Promise<{ list: ProjectCommentRow[]; total: number }> {
    if (!Number.isSafeInteger(input.from) || !Number.isSafeInteger(input.to)
      || input.from < 0 || input.to < input.from || input.to - input.from + 1 > MAX_PAGE_SIZE) {
      throw Errors.badRequest("评论分页范围无效，每页最多 100 条");
    }
    const { data, error, count } = await SupabaseDB.getAdminClient().from("project_log_project_comments")
      .select(FIELDS, { count: "exact" }).eq("tenant_id", input.tenantId)
      .eq("log_id", input.logId).eq("moderation_status", "approved")
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(input.from, input.to).returns<ProjectCommentRow[]>();
    if (error) throw Errors.dbError("查询项目沟通评论失败", error);
    return { list: data ?? [], total: count ?? 0 };
  }

  async listAuthors(input: { tenantId: string; employeeIds: string[]; customerIds: string[] }): Promise<ProjectCommentAuthor[]> {
    const batches = [
      { table: "employees", type: "employee", ids: [...new Set(input.employeeIds)] },
      { table: "customers", type: "customer", ids: [...new Set(input.customerIds)] },
    ] as const;
    if (batches.some((batch) => batch.ids.length > MAX_PAGE_SIZE)) {
      throw Errors.badRequest("每类评论作者一次最多查询 100 个");
    }
    // One comment page supplies at most 100 authors of each type; two bounded batches, no N+1.
    const results = await Promise.all(batches.map(async (batch): Promise<ProjectCommentAuthor[]> => {
      if (batch.ids.length === 0) return [];
      const { data, error } = await SupabaseDB.getAdminClient().from(batch.table)
        .select("id, name").eq("tenant_id", input.tenantId).in("id", batch.ids)
        .limit(MAX_PAGE_SIZE).returns<Array<{ id: string; name: string | null }>>();
      if (error) throw Errors.dbError("查询项目沟通评论作者失败", error);
      return (data ?? []).map((author) => ({ ...author, type: batch.type }));
    }));
    return results.flat();
  }
}

export const projectLogProjectCommentsRepository = new ProjectLogProjectCommentsRepository();
