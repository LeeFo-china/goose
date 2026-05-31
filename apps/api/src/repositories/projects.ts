import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import type {
  CreateProjectInput,
  ProjectListQuery,
  UpdateProjectInput,
} from "@/schema/projects";
import { getAsiaShanghaiTodayRange } from "@/utils/date-ranges";
import type { DepartmentCode } from "@gooes/domain";

export const PROJECT_LIST_SELECT = `
  id,
  name,
  status,
  budget,
  start_date,
  created_at,
  address,
  customer:customers!projects_customer_id_fkey(
    id,
    name
  ),
  property:properties!projects_property_id_fkey(
    community,
    building_info
  )
`;

export const PROJECT_DETAIL_SELECT = `
  *,
  customer:customers!projects_customer_id_fkey(
    id,
    name,
    phone,
    status,
    owner_id,
    owner:employees!customers_owner_id_fkey(
      id,
      name,
      avatar,
      phone
    )
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

export const EMPLOYEE_PROJECT_BOOTSTRAP_SELECT = `
  id,
  tenant_id,
  customer_id,
  property_id,
  name,
  status,
  budget,
  signed_amount,
  start_date,
  created_at,
  updated_at,
  address,
  style_tags,
  visibility_status,
  customer:customers!projects_customer_id_fkey(
    id,
    name,
    phone,
    status,
    owner_id,
    owner:employees!customers_owner_id_fkey(
      id,
      name,
      avatar,
      phone
    )
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

export const PUBLIC_PROJECT_LIST_SELECT = `
  id,
  name,
  status,
  budget,
  start_date,
  created_at,
  address,
  style_tags,
  visibility_status,
  customer:customers!projects_customer_id_fkey(
    id,
    name
  ),
  property:properties!projects_property_id_fkey(
    id,
    community,
    building_info,
    area,
    layout,
    latitude,
    longitude
  )
`;

export const PUBLIC_PROJECT_DETAIL_SELECT = `
  id,
  name,
  status,
  budget,
  start_date,
  address,
  style_tags,
  visibility_status,
  customer:customers!projects_customer_id_fkey(
    name
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

export type ProjectCoreListFilters = {
  tenantId: string;
  visibleProjectIds: string[] | null;
  status?: ProjectListQuery["status"];
  keyword?: string;
  projectIds?: string[] | null;
};

export type ProjectCreateCustomerFilters = {
  tenantId: string;
  keyword?: string;
};

export type ProjectCreateEmployeeFilters = {
  tenantId: string;
  keyword?: string;
  departmentCodes?: DepartmentCode[];
  postIds?: string[];
};

export type EmployeeProjectBootstrapBundle = {
  project: Record<string, unknown> | null;
  members: Array<Record<string, unknown>>;
  acceptance_rows: Array<Record<string, unknown>>;
  log_stage_rows: Array<Record<string, unknown>>;
  latest_log_rows: Array<Record<string, unknown>>;
  logs: {
    rows: Array<Record<string, unknown>>;
    has_more: boolean;
    comment_counts: Array<{
      log_id: string;
      comment_count: number | string;
    }>;
  };
};

function escapeSupabaseOrValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/,/g, "\\,");
}

class ProjectRepository {
  private rpc(name: string, params: Record<string, unknown>) {
    return (SupabaseDB.getAdminClient() as unknown as {
      rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { message?: string; code?: string; details?: string } | null;
      }>;
    }).rpc(name, params);
  }

  private applyProjectIdsFilter(query: any, visibleProjectIds: string[] | null) {
    if (visibleProjectIds === null) {
      return query;
    }

    if (visibleProjectIds.length === 0) {
      return query.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    return query.in("id", visibleProjectIds);
  }

  private applyProjectListFilters(query: any, filters: ProjectCoreListFilters) {
    let filteredQuery = this.applyProjectIdsFilter(
      query,
      filters.visibleProjectIds,
    ).eq("tenant_id", filters.tenantId);

    if (filters.status) {
      filteredQuery = filteredQuery.eq("status", filters.status);
    }

    if (filters.keyword) {
      const escapedKeyword = escapeSupabaseOrValue(filters.keyword);
      filteredQuery = filteredQuery.or(
        `name.ilike.%${escapedKeyword}%,address.ilike.%${escapedKeyword}%`,
      );
    }

    if (filters.projectIds !== undefined && filters.projectIds !== null) {
      if (filters.projectIds.length === 0) {
        filteredQuery = filteredQuery.eq("id", "00000000-0000-0000-0000-000000000000");
      } else {
        filteredQuery = filteredQuery.in("id", filters.projectIds);
      }
    }

    return filteredQuery;
  }

  async listTodayWorkProjectIds(tenantId: string) {
    const { startIso, endIso } = getAsiaShanghaiTodayRange();
    const ids = new Set<string>();

    const addProjectRows = (rows: Array<{ id?: string | null }> | null) => {
      (rows || []).forEach((item) => {
        if (item.id) ids.add(item.id);
      });
    };
    const addProjectIdRows = (
      rows: Array<{ project_id?: string | null }> | null,
    ) => {
      (rows || []).forEach((item) => {
        if (item.project_id) ids.add(item.project_id);
      });
    };

    const [
      createdProjects,
      updatedProjects,
      todayLogs,
      createdAcceptances,
      submittedAcceptances,
      reviewedAcceptances,
      customerConfirmedAcceptances,
    ] = await Promise.all([
      SupabaseDB.getAdminClient()
        .from("projects")
        .select("id")
        .eq("tenant_id", tenantId)
        .gte("created_at", startIso)
        .lt("created_at", endIso),
      SupabaseDB.getAdminClient()
        .from("projects")
        .select("id")
        .eq("tenant_id", tenantId)
        .gte("updated_at", startIso)
        .lt("updated_at", endIso),
      SupabaseDB.getAdminClient()
        .from("project_logs")
        .select("project_id")
        .eq("tenant_id", tenantId)
        .gte("created_at", startIso)
        .lt("created_at", endIso),
      SupabaseDB.getAdminClient()
        .from("project_acceptances")
        .select("project_id")
        .eq("tenant_id", tenantId)
        .gte("created_at", startIso)
        .lt("created_at", endIso),
      SupabaseDB.getAdminClient()
        .from("project_acceptances")
        .select("project_id")
        .eq("tenant_id", tenantId)
        .gte("submitted_at", startIso)
        .lt("submitted_at", endIso),
      SupabaseDB.getAdminClient()
        .from("project_acceptances")
        .select("project_id")
        .eq("tenant_id", tenantId)
        .gte("reviewed_at", startIso)
        .lt("reviewed_at", endIso),
      SupabaseDB.getAdminClient()
        .from("project_acceptances")
        .select("project_id")
        .eq("tenant_id", tenantId)
        .gte("customer_confirmed_at", startIso)
        .lt("customer_confirmed_at", endIso),
    ]);

    if (createdProjects.error) {
      throw Errors.dbError("查询今日新增项目失败", createdProjects.error);
    }
    if (updatedProjects.error) {
      throw Errors.dbError("查询今日更新项目失败", updatedProjects.error);
    }
    if (todayLogs.error) {
      throw Errors.dbError("查询今日项目日志失败", todayLogs.error);
    }
    if (createdAcceptances.error) {
      throw Errors.dbError("查询今日发起验收失败", createdAcceptances.error);
    }
    if (submittedAcceptances.error) {
      throw Errors.dbError("查询今日提交验收失败", submittedAcceptances.error);
    }
    if (reviewedAcceptances.error) {
      throw Errors.dbError("查询今日复核验收失败", reviewedAcceptances.error);
    }
    if (customerConfirmedAcceptances.error) {
      throw Errors.dbError("查询今日客户确认验收失败", customerConfirmedAcceptances.error);
    }

    addProjectRows(createdProjects.data as Array<{ id: string }> | null);
    addProjectRows(updatedProjects.data as Array<{ id: string }> | null);
    addProjectIdRows(todayLogs.data as Array<{ project_id: string | null }> | null);
    addProjectIdRows(
      createdAcceptances.data as Array<{ project_id: string | null }> | null,
    );
    addProjectIdRows(
      submittedAcceptances.data as Array<{ project_id: string | null }> | null,
    );
    addProjectIdRows(
      reviewedAcceptances.data as Array<{ project_id: string | null }> | null,
    );
    addProjectIdRows(
      customerConfirmedAcceptances.data as Array<{ project_id: string | null }> | null,
    );

    return Array.from(ids);
  }

  async count(filters: ProjectCoreListFilters) {
    const query = this.applyProjectListFilters(
      SupabaseDB.getAdminClient()
        .from("projects")
        .select("id", { count: "exact", head: true }),
      filters,
    );

    const { error, count } = await query;
    if (error) {
      throw Errors.dbError("列表查询失败", error);
    }

    return count ?? 0;
  }

  async listRows(input: {
    filters: ProjectCoreListFilters;
    from: number;
    to: number;
  }) {
    const query = this.applyProjectListFilters(
      SupabaseDB.getAdminClient()
        .from("projects")
        .select(PROJECT_LIST_SELECT)
        .order("created_at", { ascending: false }),
      input.filters,
    );

    const { data, error } = await query.range(input.from, input.to);
    if (error) {
      throw Errors.dbError("列表查询失败", error);
    }

    return (data || []) as unknown as Array<Record<string, unknown>>;
  }

  async findById(id: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("projects")
      .select("*")
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目失败", error);
    }

    return data;
  }

  async findDetailById(id: string, tenantId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select(PROJECT_DETAIL_SELECT)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询失败", error);
    }

    return (data as unknown as Record<string, unknown> | null) ?? null;
  }

  async findEmployeeBootstrapDetailById(id: string, tenantId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select(EMPLOYEE_PROJECT_BOOTSTRAP_SELECT)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目首屏详情失败", error);
    }

    return (data as unknown as Record<string, unknown> | null) ?? null;
  }

  async getEmployeeBootstrapBundle(input: {
    projectId: string;
    tenantId: string;
    logLimit: number;
  }) {
    const { data, error } = await this.rpc(
      "get_employee_project_detail_bootstrap_data",
      {
        p_project_id: input.projectId,
        p_tenant_id: input.tenantId,
        p_log_limit: input.logLimit,
      },
    );

    if (error) {
      throw Errors.dbError("查询员工项目首屏聚合数据失败", error);
    }

    const bundle = (data || {}) as Partial<EmployeeProjectBootstrapBundle>;
    return {
      project: bundle.project ?? null,
      members: Array.isArray(bundle.members) ? bundle.members : [],
      acceptance_rows: Array.isArray(bundle.acceptance_rows)
        ? bundle.acceptance_rows
        : [],
      log_stage_rows: Array.isArray(bundle.log_stage_rows)
        ? bundle.log_stage_rows
        : [],
      latest_log_rows: Array.isArray(bundle.latest_log_rows)
        ? bundle.latest_log_rows
        : [],
      logs: {
        rows: Array.isArray(bundle.logs?.rows) ? bundle.logs.rows : [],
        has_more: Boolean(bundle.logs?.has_more),
        comment_counts: Array.isArray(bundle.logs?.comment_counts)
          ? bundle.logs.comment_counts
          : [],
      },
    } satisfies EmployeeProjectBootstrapBundle;
  }

  private applyPublicProjectVisibilityQuery(query: any) {
    return query
      .neq("visibility_status", "hidden")
      .or("status.in.(signed,design_finalized,pending_start,started,constructing,acceptance),visibility_status.eq.public");
  }

  async listPublicProjects() {
    const query = this.applyPublicProjectVisibilityQuery(
      SupabaseDB.getAdminClient()
        .from("projects")
        .select(PUBLIC_PROJECT_LIST_SELECT)
        .order("created_at", { ascending: false }),
    );

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询公开项目列表失败", error);
    }

    return (data || []) as unknown as Array<Record<string, unknown>>;
  }

  async findPublicVisibilityById(projectId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, status, visibility_status")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询公开项目失败", error);
    }

    return (data as unknown as Record<string, unknown> | null) ?? null;
  }

  async findPublicDetailById(projectId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select(PUBLIC_PROJECT_DETAIL_SELECT)
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询公开项目详情失败", error);
    }

    return (data as unknown as Record<string, unknown> | null) ?? null;
  }

  async listPublicProjectLogs(projectId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id, project_id, stage_code, node_name, content, images, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询公开项目日志失败", error);
    }

    return (data || []) as unknown as Array<Record<string, unknown>>;
  }

  async create(input: CreateProjectInput & { tenant_id: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .insert(input)
      .select()
      .single();

    if (error) {
      throw Errors.dbError("创建失败", error);
    }

    return data as Record<string, unknown>;
  }

  async findActiveByCustomerProperty(input: {
    customerId: string;
    propertyId: string;
    tenantId: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("customer_id", input.customerId)
      .eq("property_id", input.propertyId)
      .neq("status", "invalid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户设计项目失败", error);
    }

    return (data as Record<string, unknown> | null) ?? null;
  }

  async findCustomerInTenant(input: { customerId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id")
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("校验项目客户失败", error);
    }

    return data;
  }

  async findPropertyInTenant(input: { propertyId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .select("id")
      .eq("id", input.propertyId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("校验项目房产失败", error);
    }

    return data;
  }

  async listCreateCustomers(input: {
    filters: ProjectCreateCustomerFilters;
    from: number;
    to: number;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, name, phone, owner_id", { count: "exact" })
      .eq("tenant_id", input.filters.tenantId)
      .order("created_at", { ascending: false });

    const normalizedKeyword = input.filters.keyword?.trim();
    if (normalizedKeyword) {
      const escapedKeyword = escapeSupabaseOrValue(normalizedKeyword);
      query = query.or(
        `name.ilike.%${escapedKeyword}%,phone.ilike.%${escapedKeyword}%`,
      );
    }

    const { data, error, count } = await query.range(input.from, input.to);

    if (error) {
      throw Errors.dbError("查询项目创建客户选择项失败", error);
    }

    return {
      rows: (data || []) as unknown as Array<Record<string, unknown>>,
      total: count ?? 0,
    };
  }

  async listCreateEmployees(input: {
    filters: ProjectCreateEmployeeFilters;
    from: number;
    to: number;
  }) {
    let departmentIds: string[] | undefined;
    if (input.filters.departmentCodes && input.filters.departmentCodes.length > 0) {
      const { data: departmentRows, error: departmentError } = await SupabaseDB.getAdminClient()
        .from("tenant_departments")
        .select("id")
        .eq("tenant_id", input.filters.tenantId)
        .eq("enabled", true)
        .in("code", input.filters.departmentCodes);

      if (departmentError) {
        throw Errors.dbError("查询项目创建员工部门失败", departmentError);
      }

      departmentIds = ((departmentRows || []) as Array<{ id: string | null }>)
        .map((item) => item.id)
        .filter((item): item is string => Boolean(item));

      if (departmentIds.length === 0) {
        return {
          rows: [],
          total: 0,
        };
      }
    }

    let query = SupabaseDB.getAdminClient()
      .from("employees")
      .select(
        `
        id,
        name,
        avatar,
        phone,
        tenant_department_id,
        tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code),
        post:posts!employees_post_id_fkey(id, name, code)
      `,
        { count: "exact" },
      )
      .eq("status", "active")
      .eq("tenant_id", input.filters.tenantId)
      .order("created_at", { ascending: false });

    if (departmentIds && departmentIds.length > 0) {
      query = query.in("tenant_department_id", departmentIds);
    }

    if (input.filters.postIds && input.filters.postIds.length > 0) {
      query = query.in("post_id", input.filters.postIds);
    }

    const normalizedKeyword = input.filters.keyword?.trim();
    if (normalizedKeyword) {
      const escapedKeyword = escapeSupabaseOrValue(normalizedKeyword);
      query = query.or(
        `name.ilike.%${escapedKeyword}%,phone.ilike.%${escapedKeyword}%`,
      );
    }

    const { data, error, count } = await query.range(input.from, input.to);

    if (error) {
      throw Errors.dbError("查询项目创建员工选择项失败", error);
    }

    return {
      rows: (data || []) as unknown as Array<Record<string, unknown>>,
      total: count ?? 0,
    };
  }

  async update(id: string, input: UpdateProjectInput, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("projects")
      .update(input)
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.select("*").maybeSingle();

    if (error) {
      throw Errors.dbError("更新项目失败", error);
    }

    if (!data) {
      throw Errors.badRequest("项目不存在或更新失败");
    }

    return data;
  }

  async updateIfStatus(input: {
    id: string;
    tenantId: string;
    expectedStatus: string;
    payload: UpdateProjectInput;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .update(input.payload)
      .eq("id", input.id)
      .eq("tenant_id", input.tenantId)
      .eq("status", input.expectedStatus)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新项目状态失败", error);
    }

    return data;
  }

  async scheduleConstructionTransition(input: {
    projectId: string;
    tenantId: string;
    expectedStatus: string;
    toStatus: string;
    startDate: string;
    constructionManagerEmployeeId: string;
    operatorEmployeeId?: string | null;
    operatorAuthUserId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const { data, error } = await this.rpc(
      "schedule_project_construction_transition",
      {
        p_project_id: input.projectId,
        p_tenant_id: input.tenantId,
        p_expected_status: input.expectedStatus,
        p_to_status: input.toStatus,
        p_start_date: input.startDate,
        p_construction_manager_employee_id: input.constructionManagerEmployeeId,
        p_operator_employee_id: input.operatorEmployeeId ?? null,
        p_operator_auth_user_id: input.operatorAuthUserId ?? null,
        p_reason: input.reason ?? null,
        p_metadata: input.metadata ?? {},
      },
    );

    if (error) {
      const message = error.message || error.details || "";
      if (message.includes("PROJECT_STATUS_CONFLICT")) {
        throw Errors.business(
          409,
          "项目状态已变化，请刷新后重试",
          ErrorCodes.PROJECT_STATUS_CONFLICT,
        );
      }
      if (message.includes("INVALID_CONSTRUCTION_MANAGER")) {
        throw Errors.business(
          400,
          "所选员工不能作为工程负责人",
          ErrorCodes.INVALID_CONSTRUCTION_MANAGER,
        );
      }
      if (message.includes("PROJECT_NOT_FOUND")) {
        throw Errors.badRequest("项目不存在");
      }
      throw Errors.dbError("排期开工状态流转失败", error);
    }

    if (!data) {
      throw Errors.dbError("排期开工状态流转失败");
    }

    return data as Record<string, unknown>;
  }
}

export const projectRepository = new ProjectRepository();
