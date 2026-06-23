import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export const EMPLOYEE_SELECT_WITH_DEPARTMENT = `
  *,
  tenant_department:tenant_departments!employees_tenant_department_id_fkey(
    id,
    code,
    alias_name,
    enabled
  )
`;

export const EMPLOYEE_SELECT_WITH_POST = `
  *,
  post:posts (
    code,
    name
  )
`;

export type EmployeeScope = "self" | "department" | "assigned" | "all";

export type EmployeeVisibilityFilter = {
  scope: EmployeeScope;
  employeeId?: string | null;
  departmentScopeId?: string | null;
};

export type EmployeeListFilters = {
  tenantId: string;
  visibility: EmployeeVisibilityFilter;
  status?: string;
  keyword?: string;
  tenantDepartmentId?: string;
  postId?: string;
  roleEmployeeIds?: string[];
};

export type EmployeeCoreAccessRow = {
  id: string;
  user_id?: string | null;
  tenant_department_id?: string | null;
  post_id?: string | null;
  tenant_id?: string | null;
};

export type EmployeeCoreRow = EmployeeCoreAccessRow & {
  avatar?: string | null;
  tenant_department?: unknown;
  roles?: EmployeeRoleSummary[];
};

export type EmployeeCoreLiteRow = {
  id: string;
  name: string | null;
  avatar: string | null;
};

export type EmployeeLoginBindingRow = {
  employee_id: string;
  auth_user_id: string | null;
  has_admin_web: boolean | null;
  has_wechat_mini: boolean | null;
  wechat_openid_masked: string | null;
};

export type EmployeeRoleSummary = {
  id: string;
  code: string;
  name: string;
  status: string;
};

export type TenantDepartmentWriteRow = {
  id: string;
  tenant_id: string | null;
  code: string;
  alias_name: string;
  enabled: boolean;
};

function escapeSupabaseOrValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/,/g, "\\,");
}

class EmployeeCoreRepository {
  private applyVisibility(query: any, visibility: EmployeeVisibilityFilter) {
    if (visibility.scope === "all") {
      return query;
    }

    if (visibility.scope === "department") {
      if (!visibility.departmentScopeId) {
        return query.eq("id", "00000000-0000-0000-0000-000000000000");
      }

      return query.eq("tenant_department_id", visibility.departmentScopeId);
    }

    if (!visibility.employeeId) {
      return query.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    return query.eq("id", visibility.employeeId);
  }

  private applyTenantVisibility(
    query: any,
    tenantId: string,
    visibility: EmployeeVisibilityFilter,
  ) {
    return this.applyVisibility(query, visibility).eq("tenant_id", tenantId);
  }

  private applyListFilters(query: any, filters: EmployeeListFilters) {
    let filteredQuery = this.applyTenantVisibility(
      query,
      filters.tenantId,
      filters.visibility,
    );

    if (filters.status) {
      filteredQuery = filteredQuery.eq("status", filters.status);
    }

    if (filters.tenantDepartmentId) {
      filteredQuery = filteredQuery.eq(
        "tenant_department_id",
        filters.tenantDepartmentId,
      );
    }

    if (filters.postId) {
      filteredQuery = filteredQuery.eq("post_id", filters.postId);
    }

    if (filters.roleEmployeeIds) {
      filteredQuery = filters.roleEmployeeIds.length > 0
        ? filteredQuery.in("id", filters.roleEmployeeIds)
        : filteredQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    if (filters.keyword) {
      const escapedKeyword = escapeSupabaseOrValue(filters.keyword);
      filteredQuery = filteredQuery.or(
        [
          `name.ilike.%${escapedKeyword}%`,
          `phone.ilike.%${escapedKeyword}%`,
        ].join(","),
      );
    }

    return filteredQuery;
  }

  async count(filters: EmployeeListFilters) {
    const query = this.applyListFilters(
      SupabaseDB.getAdminClient()
        .from("employees")
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
    filters: EmployeeListFilters;
    from: number;
    to: number;
  }) {
    const query = this.applyListFilters(
      SupabaseDB.getAdminClient()
        .from("employees")
        .select(EMPLOYEE_SELECT_WITH_DEPARTMENT)
        .order("created_at", { ascending: false }),
      input.filters,
    );

    const { data, error } = await query.range(input.from, input.to);
    if (error) {
      throw Errors.dbError("列表查询失败", error);
    }

    return (data || []) as unknown as EmployeeCoreRow[];
  }

  async listEmployeeRoleMap(employeeIds: string[]) {
    if (employeeIds.length === 0) {
      return new Map<string, EmployeeRoleSummary[]>();
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employee_roles")
      .select(`
        employee_id,
        role:roles (
          id,
          code,
          name,
          status
        )
      `)
      .in("employee_id", employeeIds)
      .order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询员工角色失败", error);
    }

    const roleMap = new Map<string, EmployeeRoleSummary[]>();
    for (const row of (data || []) as unknown as Array<{
      employee_id: string | null;
      role: EmployeeRoleSummary | EmployeeRoleSummary[] | null;
    }>) {
      if (!row.employee_id || !row.role) continue;
      const role = Array.isArray(row.role) ? row.role[0] : row.role;
      if (!role?.id) continue;
      roleMap.set(row.employee_id, [
        ...(roleMap.get(row.employee_id) || []),
        role,
      ]);
    }

    return roleMap;
  }

  async listEmployeeIdsByRoleId(input: { tenantId: string; roleId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employee_roles")
      .select(`
        employee_id,
        employee:employees!employee_roles_employee_id_fkey!inner(
          id,
          tenant_id
        )
      `)
      .eq("role_id", input.roleId)
      .eq("employee.tenant_id", input.tenantId);

    if (error) {
      throw Errors.dbError("查询角色关联员工失败", error);
    }

    return Array.from(new Set(((data || []) as Array<{
      employee_id: string | null;
    }>)
      .map((item) => item.employee_id)
      .filter((employeeId): employeeId is string => Boolean(employeeId))));
  }

  async listLiteByIds(input: { tenantId: string; employeeIds: string[] }) {
    const employeeIds = [...new Set(input.employeeIds.filter(Boolean))];
    if (employeeIds.length === 0) return [] as EmployeeCoreLiteRow[];

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select("id, name, avatar")
      .eq("tenant_id", input.tenantId)
      .in("id", employeeIds);

    if (error) {
      throw Errors.dbError("查询员工失败", error);
    }

    return (data || []) as unknown as EmployeeCoreLiteRow[];
  }

  async create(payload: Record<string, unknown>) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .insert(payload)
      .select(EMPLOYEE_SELECT_WITH_DEPARTMENT)
      .single();

    if (error) {
      throw Errors.dbError("创建失败", error);
    }

    return data as unknown as EmployeeCoreRow;
  }

  async findById(input: { employeeId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select(EMPLOYEE_SELECT_WITH_DEPARTMENT)
      .eq("id", input.employeeId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询失败", error);
    }

    return (data as unknown as EmployeeCoreRow | null) ?? null;
  }

  async listWithDepartment(input: {
    tenantId: string;
    visibility: EmployeeVisibilityFilter;
  }) {
    const query = this.applyTenantVisibility(
      SupabaseDB.getAdminClient()
        .from("employees")
        .select(EMPLOYEE_SELECT_WITH_DEPARTMENT),
      input.tenantId,
      input.visibility,
    );

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询失败", error);
    }

    return (data || []) as unknown as EmployeeCoreRow[];
  }

  async findWithDepartmentById(input: {
    employeeId: string;
    tenantId: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select(EMPLOYEE_SELECT_WITH_DEPARTMENT)
      .eq("id", input.employeeId)
      .eq("tenant_id", input.tenantId)
      .single();

    if (error) {
      throw Errors.dbError("查询失败", error);
    }

    return data as unknown as EmployeeCoreRow;
  }

  async listWithPost(input: {
    tenantId: string;
    visibility: EmployeeVisibilityFilter;
  }) {
    const query = this.applyTenantVisibility(
      SupabaseDB.getAdminClient()
        .from("employees")
        .select(EMPLOYEE_SELECT_WITH_POST),
      input.tenantId,
      input.visibility,
    );

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询失败", error);
    }

    return (data || []) as unknown as EmployeeCoreRow[];
  }

  async findByUserId(input: { userId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select(EMPLOYEE_SELECT_WITH_DEPARTMENT)
      .eq("user_id", input.userId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询失败", error);
    }

    return (data as unknown as EmployeeCoreRow | null) ?? null;
  }

  async findAccessById(input: { employeeId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select("id, user_id, tenant_department_id, post_id, tenant_id")
      .eq("id", input.employeeId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询失败", error);
    }

    return (data as EmployeeCoreAccessRow | null) ?? null;
  }

  async updateById(input: {
    employeeId: string;
    tenantId: string;
    payload: Record<string, unknown>;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .update(input.payload)
      .eq("id", input.employeeId)
      .eq("tenant_id", input.tenantId)
      .select(EMPLOYEE_SELECT_WITH_DEPARTMENT)
      .single();

    if (error) {
      throw Errors.dbError("更新失败", error);
    }

    return data as unknown as EmployeeCoreRow;
  }

  async markLeaved(input: { employeeId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .update({
        status: "leaved",
        user_id: null,
      })
      .eq("id", input.employeeId)
      .eq("tenant_id", input.tenantId)
      .select()
      .single();

    if (error) {
      throw Errors.dbError("删除员工失败", error);
    }

    return data as unknown as EmployeeCoreRow;
  }

  async findTenantDepartmentForEmployee(input: {
    tenantId: string;
    tenantDepartmentId?: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("tenant_departments")
      .select("id, tenant_id, code, alias_name, enabled")
      .eq("tenant_id", input.tenantId)
      .eq("enabled", true);

    if (input.tenantDepartmentId) {
      query = query.eq("id", input.tenantDepartmentId);
    } else {
      return null;
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw Errors.dbError("查询部门失败", error);
    }

    return (data as TenantDepartmentWriteRow | null) ?? null;
  }

  async listLoginBindingRows(employeeIds: string[]) {
    if (employeeIds.length === 0) {
      return [] as EmployeeLoginBindingRow[];
    }

    const { data, error } = await (SupabaseDB.getAdminClient() as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    }).rpc("list_employee_login_bindings", {
      p_employee_ids: employeeIds,
    });

    if (error) {
      throw Errors.dbError("查询员工登录绑定失败", error);
    }

    return Array.isArray(data)
      ? data as EmployeeLoginBindingRow[]
      : [] as EmployeeLoginBindingRow[];
  }
}

export const employeeCoreRepository = new EmployeeCoreRepository();
