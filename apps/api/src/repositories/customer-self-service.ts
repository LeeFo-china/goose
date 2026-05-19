import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type CustomerSelfServiceCustomerContextRow = {
  id: string;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  tenant_id: string | null;
  tenant:
    | {
      id: string | null;
      name: string | null;
      slug: string | null;
      status: string | null;
    }
    | Array<{
      id: string | null;
      name: string | null;
      slug: string | null;
      status: string | null;
    }>
    | null;
};

export type CustomerSelfServiceUserProfileRow = {
  auth_user_id: string;
  nickname: string | null;
  avatar_path: string | null;
  profile_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerSelfServiceProjectListItem = {
  id: string;
  tenant_id?: string | null;
  name: string | null;
  status: string | null;
  budget: number | null;
  address: string | null;
  start_date: string | null;
  style_tags: unknown;
  designer: {
    id: string;
    name: string | null;
    avatar?: string | null;
  } | {
    id: string;
    name: string | null;
    avatar?: string | null;
  }[] | null;
  property: {
    id: string;
    community: string | null;
    building_info: string | null;
    layout?: string | null;
    area?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  } | {
    id: string;
    community: string | null;
    building_info: string | null;
    layout?: string | null;
    area?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  }[] | null;
};

export type CustomerSelfServiceProjectLogRow = {
  id: string;
  project_id: string;
  employee_id: string | null;
  stage_code: string | null;
  node_name: string | null;
  content: string | null;
  images: unknown;
  created_at: string | null;
  employee:
    | {
      id: string | null;
      name: string | null;
      avatar?: string | null;
    }
    | {
      id: string | null;
      name: string | null;
      avatar?: string | null;
    }[]
    | null;
};

export type CustomerSelfServiceRecentLogSummaryRow = {
  project_id: string;
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  employee_avatar: string | null;
  stage_code: string | null;
  node_name: string | null;
  created_at: string | null;
  image_count: number | null;
  cover_image_path: string | null;
  comment_count: number | null;
  rating_count: number | null;
  average_rating: number | null;
};

export type CustomerSelfServiceProjectLogCommentAggregateRow = {
  id: string;
  log_id: string;
  parent_id: string | null;
  author_type: string;
  author_id: string;
  rating: number | null;
  created_at: string | null;
};

export type CustomerSelfServiceProjectLogCommentRow = {
  id: string;
  log_id: string;
  parent_id: string | null;
  author_type: string;
  author_id: string;
  content: string;
  rating: number | null;
  images: unknown;
  created_at: string | null;
};

export type CustomerSelfServiceProjectLogCommentAuthorEmployee = {
  id: string;
  name: string | null;
  avatar: string | null;
};

export type CustomerSelfServiceProjectLogCommentAuthorCustomer = {
  id: string;
  name: string | null;
};

class CustomerSelfServiceRepository {
  private adminClient = SupabaseDB.getAdminClient();

  private customerContextSelect = `
    id,
    name,
    phone,
    user_id,
    tenant_id,
    tenant:tenants!customers_tenant_id_fkey(
      id,
      name,
      slug,
      status
    )
  `;

  private projectListSelect = `
    id,
    tenant_id,
    name,
    status,
    budget,
    address,
    start_date,
    style_tags,
    designer:employees!projects_designer_id_fkey(
      id,
      name,
      avatar
    ),
    property:properties!projects_property_id_fkey(
      id,
      community,
      building_info,
      layout,
      area,
      latitude,
      longitude
    )
  `;

  async listLegacyCustomerProfilesByAuthUserId(
    authUserId: string,
    options?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    let query = this.adminClient
      .from("customers")
      .select(this.customerContextSelect)
      .eq("user_id", authUserId);

    if (options?.tenantId) {
      query = query.eq("tenant_id", options.tenantId);
    }

    if (options?.customerId) {
      query = query.eq("id", options.customerId);
    }

    const { data, error } = await query.limit(2);

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    return (data || []) as unknown as CustomerSelfServiceCustomerContextRow[];
  }

  async listCustomerProfilesByIds(customerIds: string[]) {
    if (customerIds.length === 0) {
      return [] as CustomerSelfServiceCustomerContextRow[];
    }

    const { data, error } = await this.adminClient
      .from("customers")
      .select(this.customerContextSelect)
      .in("id", customerIds);

    if (error) {
      throw Errors.dbError("查询客户业务身份失败", error);
    }

    return (data || []) as unknown as CustomerSelfServiceCustomerContextRow[];
  }

  async getUserProfileByAuthUserId(authUserId: string) {
    const { data, error } = await this.adminClient
      .from("user_profiles")
      .select("auth_user_id, nickname, avatar_path, profile_completed_at, created_at, updated_at")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询用户资料失败", error);
    }

    return (data as CustomerSelfServiceUserProfileRow | null) || null;
  }

  async upsertUserProfile(input: {
    authUserId: string;
    nickname: string | null;
    avatarPath: string | null;
    profileCompletedAt: string | null;
  }) {
    const { data, error } = await this.adminClient
      .from("user_profiles")
      .upsert({
        auth_user_id: input.authUserId,
        nickname: input.nickname,
        avatar_path: input.avatarPath,
        profile_completed_at: input.profileCompletedAt,
      }, {
        onConflict: "auth_user_id",
      })
      .select("auth_user_id, nickname, avatar_path, profile_completed_at, created_at, updated_at")
      .single();

    if (error) {
      throw Errors.dbError("保存用户资料失败", error);
    }

    return data as CustomerSelfServiceUserProfileRow;
  }

  async listOwnedProjects(input: {
    customerId: string;
    tenantId: string;
    from: number;
    to: number;
  }) {
    const { data, error, count } = await this.adminClient
      .from("projects")
      .select(this.projectListSelect, { count: "exact" })
      .eq("customer_id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .range(input.from, input.to);

    if (error) {
      throw Errors.dbError("查询客户项目列表失败", error);
    }

    return {
      list: (data || []) as unknown as CustomerSelfServiceProjectListItem[],
      count: count || 0,
    };
  }

  async findOwnedProject(input: {
    projectId: string;
    customerId: string;
    tenantId?: string | null;
  }) {
    let query = this.adminClient
      .from("projects")
      .select(this.projectListSelect)
      .eq("id", input.projectId)
      .eq("customer_id", input.customerId);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户项目详情失败", error);
    }

    return (data as unknown as CustomerSelfServiceProjectListItem | null) ?? null;
  }

  async listRecentLogSummariesForProjects(input: {
    customerId: string;
    projectIds: string[];
    perProject: number;
  }) {
    if (input.projectIds.length === 0) {
      return [] as CustomerSelfServiceRecentLogSummaryRow[];
    }

    const { data, error } = await this.adminClient.rpc(
      "get_customer_project_recent_log_summaries",
      {
        p_customer_id: input.customerId,
        p_project_ids: input.projectIds,
        p_per_project: input.perProject,
      },
    );

    if (error) {
      throw Errors.dbError("查询客户项目最近日志摘要失败", error);
    }

    return (data || []) as CustomerSelfServiceRecentLogSummaryRow[];
  }

  async findOwnedProjectLog(input: {
    logId: string;
    projectId: string;
    tenantId?: string | null;
  }) {
    let query = this.adminClient
      .from("project_logs")
      .select("id, project_id")
      .eq("id", input.logId)
      .eq("project_id", input.projectId);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query.maybeSingle<{
      id: string;
      project_id: string;
    }>();

    if (error) {
      throw Errors.dbError("查询客户项目日志失败", error);
    }

    return data ?? null;
  }

  async listProjectLogs(input: {
    projectId: string;
    tenantId: string | null;
    from: number;
    to: number;
  }) {
    let query = this.adminClient
      .from("project_logs")
      .select(`
        id,
        project_id,
        employee_id,
        stage_code,
        node_name,
        content,
        images,
        created_at,
        employee:employees!project_logs_employee_id_fkey(
          id,
          name,
          avatar
        )
      `, { count: "exact" })
      .eq("project_id", input.projectId)
      .order("created_at", { ascending: false })
      .range(input.from, input.to);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error, count } = await query;

    if (error) {
      throw Errors.dbError("查询客户项目日志失败", error);
    }

    return {
      list: (data || []) as unknown as CustomerSelfServiceProjectLogRow[],
      count: count || 0,
    };
  }

  async listProjectLogCommentAggregates(input: {
    logIds: string[];
    tenantId: string | null;
  }) {
    if (input.logIds.length === 0) {
      return [] as CustomerSelfServiceProjectLogCommentAggregateRow[];
    }

    let query = this.adminClient
      .from("project_log_comments")
      .select("id, log_id, parent_id, author_type, author_id, rating, created_at")
      .in("log_id", input.logIds)
      .is("deleted_at", null);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询日志评论聚合失败", error);
    }

    return (data || []) as CustomerSelfServiceProjectLogCommentAggregateRow[];
  }

  async listProjectLogComments(input: {
    logId: string;
    tenantId: string | null;
    from: number;
    to: number;
  }) {
    let query = this.adminClient
      .from("project_log_comments")
      .select(
        "id, log_id, parent_id, author_type, author_id, content, rating, images, created_at",
        { count: "exact" },
      )
      .eq("log_id", input.logId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(input.from, input.to);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error, count } = await query;

    if (error) {
      throw Errors.dbError("查询日志评论失败", error);
    }

    return {
      list: (data || []) as unknown as CustomerSelfServiceProjectLogCommentRow[],
      count: count || 0,
    };
  }

  async listCommentAuthorEmployees(employeeIds: string[]) {
    if (employeeIds.length === 0) {
      return [] as CustomerSelfServiceProjectLogCommentAuthorEmployee[];
    }

    const { data, error } = await this.adminClient
      .from("employees")
      .select("id, name, avatar")
      .in("id", employeeIds);

    if (error) {
      throw Errors.dbError("查询评论员工作者失败", error);
    }

    return (data || []) as CustomerSelfServiceProjectLogCommentAuthorEmployee[];
  }

  async listCommentAuthorCustomers(customerIds: string[]) {
    if (customerIds.length === 0) {
      return [] as CustomerSelfServiceProjectLogCommentAuthorCustomer[];
    }

    const { data, error } = await this.adminClient
      .from("customers")
      .select("id, name")
      .in("id", customerIds);

    if (error) {
      throw Errors.dbError("查询评论客户作者失败", error);
    }

    return (data || []) as CustomerSelfServiceProjectLogCommentAuthorCustomer[];
  }
}

export const customerSelfServiceRepository = new CustomerSelfServiceRepository();
