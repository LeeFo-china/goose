import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type EmployeeCommentAuthorRecord = {
  id: string;
  name: string | null;
  avatar: string | null;
  user_id: string | null;
  tenant_id: string | null;
};

export type CustomerCommentAuthorRecord = {
  id: string;
  name: string | null;
  user_id: string | null;
  tenant_id: string | null;
};

export type ProjectLogCommentRow = {
  id: string;
  tenant_id: string | null;
  log_id: string;
  parent_id: string | null;
  author_type: string;
  author_id: string;
  content: string;
  rating: number | null;
  images: unknown;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

export type ProjectLogCommentSummaryRow = Pick<
  ProjectLogCommentRow,
  | "id"
  | "log_id"
  | "parent_id"
  | "author_type"
  | "author_id"
  | "content"
  | "rating"
  | "created_at"
>;

export type ProjectLogAccessInfo = {
  id: string;
  project_id: string;
  tenant_id: string | null;
};

export type ProjectOwnerInfo = {
  id: string;
  customer_id: string | null;
  tenant_id: string | null;
};

class ProjectLogCommentsRepository {
  async findEmployeeAuthorByAuthUserId(authUserId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select("id, name, avatar, user_id, tenant_id")
      .eq("user_id", authUserId)
      .limit(1)
      .maybeSingle<EmployeeCommentAuthorRecord>();

    if (error) {
      throw Errors.dbError("查询员工身份失败", error);
    }

    return data ?? null;
  }

  async findCustomerAuthorByAuthUserId(authUserId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, name, user_id, tenant_id")
      .eq("user_id", authUserId)
      .limit(1)
      .maybeSingle<CustomerCommentAuthorRecord>();

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    return data ?? null;
  }

  async findProjectLogAccessInfo(logId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id, project_id, tenant_id")
      .eq("id", logId)
      .maybeSingle<ProjectLogAccessInfo>();

    if (error) {
      throw Errors.dbError("查询项目日志失败", error);
    }

    return data ?? null;
  }

  async findProjectOwner(input: {
    projectId: string;
    tenantId: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, customer_id, tenant_id")
      .eq("id", input.projectId);

    query = input.tenantId
      ? query.eq("tenant_id", input.tenantId)
      : query.is("tenant_id", null);

    const { data, error } = await query.maybeSingle<ProjectOwnerInfo>();

    if (error) {
      throw Errors.dbError("查询项目归属失败", error);
    }

    return data ?? null;
  }

  async findParentComment(input: {
    parentId: string;
    tenantId: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("project_log_comments")
      .select("id, log_id")
      .eq("id", input.parentId)
      .is("deleted_at", null);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query.maybeSingle<{
      id: string;
      log_id: string;
    }>();

    if (error) {
      throw Errors.dbError("查询父评论失败", error);
    }

    return data ?? null;
  }

  async hasCustomerExistingRating(input: {
    logId: string;
    customerId: string;
    tenantId: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("project_log_comments")
      .select("id")
      .eq("log_id", input.logId)
      .eq("author_type", "customer")
      .eq("author_id", input.customerId)
      .is("parent_id", null)
      .not("rating", "is", null)
      .is("deleted_at", null)
      .limit(1);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query.maybeSingle<{ id: string }>();

    if (error) {
      throw Errors.dbError("查询客户评分记录失败", error);
    }

    return Boolean(data?.id);
  }

  async create(payload: Record<string, unknown>) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_log_comments")
      .insert(payload)
      .select()
      .single<ProjectLogCommentRow>();

    if (error || !data) {
      throw Errors.dbError("创建日志评论失败", error);
    }

    return data;
  }

  async listByLog(input: {
    logId: string;
    tenantId: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("project_log_comments")
      .select("*")
      .eq("log_id", input.logId)
      .is("deleted_at", null);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询日志评论失败", error);
    }

    return (data || []) as ProjectLogCommentRow[];
  }

  async listSummariesByLogIds(input: {
    logIds: string[];
    tenantId: string | null;
  }) {
    if (input.logIds.length === 0) {
      return [] as ProjectLogCommentSummaryRow[];
    }

    let query = SupabaseDB.getAdminClient()
      .from("project_log_comments")
      .select("id, log_id, parent_id, author_type, author_id, content, rating, created_at")
      .in("log_id", input.logIds)
      .is("deleted_at", null);

    query = input.tenantId
      ? query.eq("tenant_id", input.tenantId)
      : query.is("tenant_id", null);

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询日志评论摘要失败", error);
    }

    return (data || []) as ProjectLogCommentSummaryRow[];
  }

  async listEmployeeAuthors(employeeIds: string[]) {
    if (employeeIds.length === 0) {
      return [];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select("id, name, avatar")
      .in("id", employeeIds);

    if (error) {
      throw Errors.dbError("查询员工评论作者失败", error);
    }

    return (data || []) as Array<{
      id: string;
      name: string | null;
      avatar: string | null;
    }>;
  }

  async listCustomerAuthors(customerIds: string[]) {
    if (customerIds.length === 0) {
      return [];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, name")
      .in("id", customerIds);

    if (error) {
      throw Errors.dbError("查询客户评论作者失败", error);
    }

    return (data || []) as Array<{
      id: string;
      name: string | null;
    }>;
  }
}

export const projectLogCommentsRepository = new ProjectLogCommentsRepository();
