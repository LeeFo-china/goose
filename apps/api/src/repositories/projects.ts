import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import type {
  CreateProjectInput,
  ProjectListQuery,
  UpdateProjectInput,
} from "@/schema/projects";
import { getAsiaShanghaiTodayRange } from "@/utils/date-ranges";

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
  ),
  designer:employees!projects_designer_id_fkey(
    id,
    name
  ),
  supervisor:employees!projects_supervisor_id_fkey(
    id,
    name
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
  ),
  designer:employees!projects_designer_id_fkey(
    id,
    name,
    avatar,
    phone
  ),
  supervisor:employees!projects_supervisor_id_fkey(
    id,
    name,
    avatar,
    phone
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
  ),
  designer:employees!projects_designer_id_fkey(
    id,
    name,
    avatar
  ),
  supervisor:employees!projects_supervisor_id_fkey(
    id,
    name,
    avatar
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
  postIds?: string[];
};

function escapeSupabaseOrValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/,/g, "\\,");
}

class ProjectRepository {
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

  async countEmployeesInTenant(input: { employeeIds: string[]; tenantId: string }) {
    if (input.employeeIds.length === 0) {
      return 0;
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select("id")
      .in("id", input.employeeIds)
      .eq("tenant_id", input.tenantId);

    if (error) {
      throw Errors.dbError("校验项目成员失败", error);
    }

    return (data || []).length;
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
    let query = SupabaseDB.getAdminClient()
      .from("employees")
      .select(
        `
        id,
        name,
        avatar,
        phone,
        department_id,
        tenant_department_id,
        tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code, legacy_department_id),
        department:departments!employees_department_id_fkey(id, name, code),
        post:posts!employees_post_id_fkey(id, name, code)
      `,
        { count: "exact" },
      )
      .eq("status", "active")
      .eq("tenant_id", input.filters.tenantId)
      .order("created_at", { ascending: false });

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
}

export const projectRepository = new ProjectRepository();
