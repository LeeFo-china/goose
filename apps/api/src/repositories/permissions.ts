import { Errors } from "@/errors/error-factory";
import type {
  AssignEmployeeRolesInput,
  CreatePermissionInput,
  CreateRoleInput,
  EmployeePermissionOverrideInput,
  PermissionListQueryType,
  RolePermissionAssignInput,
  RoleListQueryType,
  UpdatePermissionInput,
  UpdateRoleInput,
} from "@/schema/permissions";
import { SupabaseDB } from "@/utils/supabase";

export type RoleRecord = {
  id: string;
  tenant_id?: string | null;
  code: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PermissionRecord = {
  id: string;
  code: string;
  name: string;
  module: string;
  resource: string;
  action: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type RolePermissionRecord = PermissionRecord & {
  access_scope: string;
};

export type EmployeePermissionContextRecord = {
  employee: {
    id: string;
    user_id: string | null;
    tenant_id: string | null;
    status: string | null;
    department_id: string | null;
    tenant_department_id: string | null;
    post_id: string | null;
    name: string | null;
    phone: string | null;
    avatar: string | null;
    department:
      | { name: string | null; code?: string | null }
      | Array<{ name: string | null; code?: string | null }>
      | null;
    tenant_department:
      | {
        id: string | null;
        alias_name: string | null;
        code: string | null;
        legacy_department_id: string | null;
      }
      | Array<{
        id: string | null;
        alias_name: string | null;
        code: string | null;
        legacy_department_id: string | null;
      }>
      | null;
    post:
      | { name: string | null }
      | Array<{ name: string | null }>
      | null;
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
  } | null;
  roles: RoleRecord[];
  rolePermissions: Array<{
    code: string;
    scope: string;
  }>;
  overrides: Array<{
    permission_id: string;
    permission_code: string;
    permission_name: string | null;
    code: string;
    effect: string;
    access_scope: string | null;
    scope: string | null;
    reason: string | null;
    created_at: string;
    updated_at: string;
  }>;
};

type RoleWithPermissionsRecord = RoleRecord & {
  role_permissions?: Array<{
    access_scope: string;
    permission: { code: string } | null;
  }> | null;
};

type EmployeePermissionContextRpcRow = {
  employee: EmployeePermissionContextRecord["employee"];
  roles: RoleRecord[] | null;
  role_permissions: EmployeePermissionContextRecord["rolePermissions"] | null;
  overrides: EmployeePermissionContextRecord["overrides"] | null;
};

class PermissionRepository {
  private adminClient = SupabaseDB.getAdminClient();

  private rpc(name: string, params: Record<string, unknown>) {
    return (this.adminClient as unknown as {
      rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<{
        data: unknown;
        error: unknown;
      }>;
    }).rpc(name, params);
  }

  private isRetryableError(error: unknown) {
    if (!error || typeof error !== "object") {
      return false;
    }

    const message = "message" in error && typeof error.message === "string"
      ? error.message
      : "";

    return (
      message.includes("TimeoutError") ||
      message.includes("timed out") ||
      message.includes("network") ||
      message.includes("fetch failed")
    );
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    retries = 2,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt >= retries || !this.isRetryableError(error)) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private async withRetryResult<T extends { error: unknown | null; data?: unknown }>(
    operation: () => Promise<T>,
    retries = 2,
  ): Promise<T> {
    let lastResult: T | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const result = await operation();
      lastResult = result;

      if (!result.error) {
        return result;
      }

      if (attempt >= retries || !this.isRetryableError(result.error)) {
        return result;
      }
    }

    if (!lastResult) {
      throw new Error("重试失败");
    }

    return lastResult;
  }

  async listRoles(params: RoleListQueryType, tenantId?: string | null) {
    const { page, pageSize, status, keyword } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.adminClient
      .from("roles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (keyword) {
      query = query.or(`code.ilike.%${keyword}%,name.ilike.%${keyword}%`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) {
      throw Errors.dbError("查询角色列表失败", error);
    }

    return {
      list: (data as RoleRecord[] | null) || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async findRoleById(id: string, tenantId?: string | null): Promise<RoleRecord | null> {
    let query = this.adminClient
      .from("roles")
      .select("*")
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询角色失败", error);
    }

    return (data as RoleRecord | null) ?? null;
  }

  async listRolePermissionRecords(roleId: string): Promise<RolePermissionRecord[]> {
    const { data, error } = await this.adminClient
      .from("role_permissions")
      .select(`
        access_scope,
        permission:permissions (
          id,
          code,
          name,
          module,
          resource,
          action,
          description,
          status,
          created_at,
          updated_at
        )
      `)
      .eq("role_id", roleId);

    if (error) {
      throw Errors.dbError("查询角色权限失败", error);
    }

    const rows = ((data || []) as unknown as Array<{
      access_scope: string;
      permission: PermissionRecord | null;
    }>);

    return rows
      .filter((item): item is { access_scope: string; permission: PermissionRecord } =>
        Boolean(item.permission)
      )
      .map((item) => ({
        ...item.permission,
        access_scope: item.access_scope,
      }));
  }

  async createRole(input: CreateRoleInput & { tenant_id?: string | null }): Promise<RoleRecord> {
    const { data, error } = await this.adminClient
      .from("roles")
      .insert(input)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("创建角色失败", error);
    }

    if (!data) {
      throw Errors.badRequest("创建角色失败");
    }

    return data as RoleRecord;
  }

  async updateRole(
    id: string,
    input: UpdateRoleInput,
    tenantId?: string | null,
  ): Promise<RoleRecord> {
    let query = this.adminClient
      .from("roles")
      .update(input)
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.select("*").maybeSingle();

    if (error) {
      throw Errors.dbError("更新角色失败", error);
    }

    if (!data) {
      throw Errors.badRequest("角色不存在或更新失败");
    }

    return data as RoleRecord;
  }

  async listPermissions(params: PermissionListQueryType) {
    const { page, pageSize, status, module, keyword } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.adminClient
      .from("permissions")
      .select("*", { count: "exact" })
      .order("module", { ascending: true })
      .order("code", { ascending: true });

    if (status) {
      query = query.eq("status", status);
    }

    if (module) {
      query = query.eq("module", module);
    }

    if (keyword) {
      query = query.or(
        `code.ilike.%${keyword}%,name.ilike.%${keyword}%,description.ilike.%${keyword}%,resource.ilike.%${keyword}%`,
      );
    }

    const { data, error, count } = await query.range(from, to);
    if (error) {
      throw Errors.dbError("查询权限列表失败", error);
    }

    return {
      list: (data as PermissionRecord[] | null) || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async findPermissionById(id: string): Promise<PermissionRecord | null> {
    const { data, error } = await this.adminClient
      .from("permissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询权限失败", error);
    }

    return (data as PermissionRecord | null) ?? null;
  }

  async findPermissionByCode(code: string): Promise<PermissionRecord | null> {
    const { data, error } = await this.adminClient
      .from("permissions")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询权限失败", error);
    }

    return (data as PermissionRecord | null) ?? null;
  }

  async createPermission(input: CreatePermissionInput): Promise<PermissionRecord> {
    const { data, error } = await this.adminClient
      .from("permissions")
      .insert(input)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("创建权限失败", error);
    }

    if (!data) {
      throw Errors.badRequest("创建权限失败");
    }

    return data as PermissionRecord;
  }

  async updatePermission(
    id: string,
    input: UpdatePermissionInput,
  ): Promise<PermissionRecord> {
    const { data, error } = await this.adminClient
      .from("permissions")
      .update(input)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新权限失败", error);
    }

    if (!data) {
      throw Errors.badRequest("权限不存在或更新失败");
    }

    return data as PermissionRecord;
  }

  async findEmployeeById(id: string) {
    const { data, error } = await this.adminClient
      .from("employees")
      .select(`
        id,
        user_id,
        tenant_id,
        status,
        department_id,
        tenant_department_id,
        post_id,
        name,
        phone,
        avatar,
        tenant:tenants!employees_tenant_id_fkey(id, name, slug, status),
        tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code, legacy_department_id),
        department:departments!employees_department_id_fkey(name, code),
        post:posts!employees_post_id_fkey(name)
      `)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询员工失败", error);
    }

    return data;
  }

  async findEmployeeByAuthUserId(authUserId: string) {
    const { data, error } = await this.adminClient
      .from("employees")
      .select(`
        id,
        user_id,
        tenant_id,
        status,
        department_id,
        tenant_department_id,
        post_id,
        name,
        phone,
        avatar,
        tenant:tenants!employees_tenant_id_fkey(id, name, slug, status),
        tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code, legacy_department_id),
        department:departments!employees_department_id_fkey(name, code),
        post:posts!employees_post_id_fkey(name)
      `)
      .eq("user_id", authUserId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询员工失败", error);
    }

    return data;
  }

  async listEmployeeRoles(employeeId: string): Promise<RoleRecord[]> {
    const { data, error } = await this.adminClient
      .from("employee_roles")
      .select(`
        role:roles (
          id,
          code,
          name,
          description,
          status,
          tenant_id,
          created_at,
          updated_at
        )
      `)
      .eq("employee_id", employeeId);

    if (error) {
      throw Errors.dbError("查询员工角色失败", error);
    }

    const rows = ((data || []) as unknown as Array<{
      role: RoleRecord | null;
    }>);

    return (rows
      .map((item) => item.role)
      .filter(Boolean) as RoleRecord[]);
  }

  private async listEmployeeRolesWithPermissions(employeeId: string) {
    const { data, error } = await this.adminClient
      .from("employee_roles")
      .select(`
        role:roles (
          id,
          code,
          name,
          description,
          status,
          tenant_id,
          created_at,
          updated_at,
          role_permissions (
            access_scope,
            permission:permissions (
              code
            )
          )
        )
      `)
      .eq("employee_id", employeeId);

    if (error) {
      throw Errors.dbError("查询员工角色权限失败", error);
    }

    const rows = ((data || []) as unknown as Array<{
      role: RoleWithPermissionsRecord | null;
    }>);
    const roles: RoleRecord[] = [];
    const rolePermissions: Array<{ code: string; scope: string }> = [];

    for (const row of rows) {
      if (!row.role) continue;
      const { role_permissions: permissions, ...role } = row.role;
      roles.push(role);

      for (const item of permissions || []) {
        if (!item.permission?.code) continue;
        rolePermissions.push({
          code: item.permission.code,
          scope: item.access_scope,
        });
      }
    }

    return { roles, rolePermissions };
  }

  async listEmployeeRoleIds(employeeId: string) {
    const { data, error } = await this.withRetryResult(async () =>
      await this.adminClient
        .from("employee_roles")
        .select("role_id")
        .eq("employee_id", employeeId)
    );

    if (error) {
      throw Errors.dbError("查询员工角色失败", error);
    }

    return ((data || []) as Array<{ role_id: string }>).map((item) => item.role_id);
  }

  async listRolesByIds(roleIds: string[], tenantId?: string | null): Promise<RoleRecord[]> {
    if (roleIds.length === 0) {
      return [];
    }

    let query = this.adminClient
      .from("roles")
      .select("*")
      .in("id", roleIds);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询角色失败", error);
    }

    return (data as RoleRecord[] | null) || [];
  }

  async listEmployeesByRoleId(roleId: string) {
    const { data, error } = await this.adminClient
      .from("employee_roles")
      .select(`
        employee:employees (
          id,
          user_id
        )
      `)
      .eq("role_id", roleId);

    if (error) {
      throw Errors.dbError("查询角色关联员工失败", error);
    }

    const rows = ((data || []) as unknown as Array<{
      employee: { id: string; user_id: string | null } | null;
    }>);

    return rows
      .map((item) => item.employee)
      .filter((item): item is { id: string; user_id: string | null } => Boolean(item));
  }

  async listEmployeeIdsByDepartmentId(departmentId: string, tenantId?: string | null) {
    let query = this.adminClient
      .from("employees")
      .select("id")
      .or(`tenant_department_id.eq.${departmentId},department_id.eq.${departmentId}`);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询部门员工失败", error);
    }

    return ((data || []) as Array<{ id: string }>).map((item) => item.id);
  }

  async listVisibleProjectIds(params: {
    scope: "self" | "department" | "assigned" | "all";
    employeeId: string;
    departmentId: string | null;
    tenantDepartmentId?: string | null;
    tenantId?: string | null;
  }) {
    if (params.scope === "all") {
      let query = this.adminClient
        .from("projects")
        .select("id");

      if (params.tenantId) {
        query = query.eq("tenant_id", params.tenantId);
      }

      const { data, error } = await query;

      if (error) {
        throw Errors.dbError("查询项目权限范围失败", error);
      }

      return ((data || []) as Array<{ id: string }>).map((item) => item.id);
    }

    let employeeIds = [params.employeeId];
    const departmentScopeId = params.tenantDepartmentId || params.departmentId;
    if (params.scope === "department" && departmentScopeId) {
      employeeIds = await this.listEmployeeIdsByDepartmentId(
        departmentScopeId,
        params.tenantId,
      );
    }

    const visibleIds = employeeIds.filter(Boolean);
    if (visibleIds.length === 0) {
      return [] as string[];
    }

    let memberQuery = this.adminClient
        .from("project_members")
        .select("project_id")
        .in("employee_id", visibleIds)
        .is("deleted_at", null);
    let customerQuery = this.adminClient
        .from("customers")
        .select("id")
        .in("owner_id", visibleIds);

    if (params.tenantId) {
      customerQuery = customerQuery.eq("tenant_id", params.tenantId);
    }

    const [memberResult, customerResult] = await Promise.all([
      memberQuery,
      customerQuery,
    ]);

    if (memberResult.error) {
      throw Errors.dbError("查询项目权限范围失败", memberResult.error);
    }

    if (customerResult.error) {
      throw Errors.dbError("查询项目权限范围失败", customerResult.error);
    }

    const projectIdSet = new Set(
      ((memberResult.data || []) as Array<{ project_id: string | null }>)
        .map((item) => item.project_id)
        .filter((item): item is string => Boolean(item)),
    );

    const customerIds = ((customerResult.data || []) as Array<{ id: string }>)
      .map((item) => item.id)
      .filter(Boolean);

    if (customerIds.length > 0) {
      let projectQuery = this.adminClient
        .from("projects")
        .select("id")
        .in("customer_id", customerIds);

      if (params.tenantId) {
        projectQuery = projectQuery.eq("tenant_id", params.tenantId);
      }

      const { data, error } = await projectQuery;

      if (error) {
        throw Errors.dbError("查询项目权限范围失败", error);
      }

      ((data || []) as Array<{ id: string }>).forEach((item) => {
        if (item.id) {
          projectIdSet.add(item.id);
        }
      });
    }

    const scopedProjectIds = [...projectIdSet];
    if (params.tenantId && scopedProjectIds.length > 0) {
      const { data, error } = await this.adminClient
        .from("projects")
        .select("id")
        .in("id", scopedProjectIds)
        .eq("tenant_id", params.tenantId);

      if (error) {
        throw Errors.dbError("查询项目权限范围失败", error);
      }

      return ((data || []) as Array<{ id: string }>).map((item) => item.id);
    }

    return scopedProjectIds;
  }

  async findProjectTenantById(projectId: string) {
    const { data, error } = await this.adminClient
      .from("projects")
      .select("id, tenant_id")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目权限范围失败", error);
    }

    return data as { id: string; tenant_id: string | null } | null;
  }

  async hasActiveProjectMember(input: {
    projectId: string;
    employeeIds: string[];
  }) {
    const employeeIds = Array.from(new Set(input.employeeIds.filter(Boolean)));
    if (employeeIds.length === 0) {
      return false;
    }

    const { data, error } = await this.adminClient
      .from("project_members")
      .select("id")
      .eq("project_id", input.projectId)
      .in("employee_id", employeeIds)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目成员权限失败", error);
    }

    return Boolean(data);
  }

  async listRolePermissions(roleIds: string[]) {
    if (roleIds.length === 0) {
      return [] as Array<{ code: string; scope: string }>;
    }

    const { data, error } = await this.adminClient
      .from("role_permissions")
      .select(`
        access_scope,
        permission:permissions (
          code
        )
      `)
      .in("role_id", roleIds);

    if (error) {
      throw Errors.dbError("查询角色权限失败", error);
    }

    const rows = ((data || []) as unknown as Array<{
      access_scope: string;
      permission: { code: string } | null;
    }>);

    return rows
      .map((item) => ({
        code: item.permission?.code,
        scope: item.access_scope,
      }))
      .filter((item): item is { code: string; scope: string } => Boolean(item.code));
  }

  async listEmployeePermissionOverrides(employeeId: string) {
    const { data, error } = await this.adminClient
      .from("employee_permission_overrides")
      .select(`
        permission_id,
        effect,
        access_scope,
        reason,
        created_at,
        updated_at,
        permission:permissions (
          id,
          code,
          name
        )
      `)
      .eq("employee_id", employeeId);

    if (error) {
      throw Errors.dbError("查询员工权限覆盖失败", error);
    }

    const rows = ((data || []) as unknown as Array<{
      permission_id: string;
      effect: string;
      access_scope: string | null;
      reason: string | null;
      created_at: string;
      updated_at: string;
      permission: { id: string; code: string; name: string | null } | null;
    }>);

    return rows
      .map((item) => ({
        permission_id: item.permission_id,
        permission_code: item.permission?.code,
        permission_name: item.permission?.name ?? null,
        code: item.permission?.code,
        effect: item.effect,
        access_scope: item.access_scope,
        scope: item.access_scope,
        reason: item.reason,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }))
      .filter((item): item is {
        permission_id: string;
        permission_code: string;
        permission_name: string | null;
        code: string;
        effect: string;
        access_scope: string | null;
        scope: string | null;
        reason: string | null;
        created_at: string;
        updated_at: string;
      } => Boolean(item.code));
  }

  async replaceEmployeeRoles(employeeId: string, input: AssignEmployeeRolesInput) {
    const targetRoleIds = Array.from(new Set(input.role_ids));
    const existingRoleIds = await this.withRetry(
      () => this.listEmployeeRoleIds(employeeId),
    );

    const targetRoleIdSet = new Set(targetRoleIds);
    const existingRoleIdSet = new Set(existingRoleIds);

    const roleIdsToDelete = existingRoleIds.filter((roleId) =>
      !targetRoleIdSet.has(roleId)
    );
    const roleIdsToUpsert = targetRoleIds.filter((roleId) =>
      !existingRoleIdSet.has(roleId)
    );

    if (roleIdsToDelete.length > 0) {
      const { error: deleteError } = await this.withRetryResult(async () =>
        await this.adminClient
          .from("employee_roles")
          .delete()
          .eq("employee_id", employeeId)
          .in("role_id", roleIdsToDelete)
          .select("id")
      );

      if (deleteError) {
        throw Errors.dbError("更新员工角色失败", deleteError);
      }
    }

    if (roleIdsToUpsert.length > 0) {
      const payload = roleIdsToUpsert.map((roleId) => ({
        employee_id: employeeId,
        role_id: roleId,
      }));

      const { error: upsertError } = await this.withRetryResult(async () =>
        await this.adminClient
          .from("employee_roles")
          .upsert(payload, {
            onConflict: "employee_id,role_id",
          })
          .select("id")
      );

      if (upsertError) {
        throw Errors.dbError("更新员工角色失败", upsertError);
      }
    }

    return this.withRetry(() => this.listEmployeeRoles(employeeId));
  }

  async replaceRolePermissions(roleId: string, input: RolePermissionAssignInput) {
    const targetPermissions = input.permissions;

    const { error: deleteError } = await this.adminClient
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId)
      .select("id");

    if (deleteError) {
      throw Errors.dbError("更新角色权限失败", deleteError);
    }

    if (targetPermissions.length === 0) {
      return [] as RolePermissionRecord[];
    }

    const payload = targetPermissions.map((item) => ({
      role_id: roleId,
      permission_id: item.permission_id,
      access_scope: item.access_scope,
    }));

    const { error: insertError } = await this.adminClient
      .from("role_permissions")
      .insert(payload)
      .select("id");

    if (insertError) {
      throw Errors.dbError("更新角色权限失败", insertError);
    }

    return this.listRolePermissionRecords(roleId);
  }

  async upsertEmployeePermissionOverride(
    employeeId: string,
    input: EmployeePermissionOverrideInput,
  ) {
    const payload = {
      employee_id: employeeId,
      permission_id: input.permission_id,
      effect: input.effect,
      access_scope: input.effect === "allow" ? (input.access_scope || "self") : null,
      reason: input.reason || null,
    };

    const { error } = await this.adminClient
      .from("employee_permission_overrides")
      .upsert(payload, {
        onConflict: "employee_id,permission_id",
      })
      .select("id");

    if (error) {
      throw Errors.dbError("保存员工权限覆盖失败", error);
    }

    return this.listEmployeePermissionOverrides(employeeId);
  }

  async deleteEmployeePermissionOverride(employeeId: string, permissionId: string) {
    const { error } = await this.adminClient
      .from("employee_permission_overrides")
      .delete()
      .eq("employee_id", employeeId)
      .eq("permission_id", permissionId)
      .select("id");

    if (error) {
      throw Errors.dbError("删除员工权限覆盖失败", error);
    }

    return this.listEmployeePermissionOverrides(employeeId);
  }

  async getEmployeePermissionContextByEmployeeId(
    employeeId: string,
  ): Promise<EmployeePermissionContextRecord> {
    const { data, error } = await this.rpc("get_employee_permission_context_fast", {
      p_employee_id: employeeId,
    });

    if (error) {
      throw Errors.dbError("查询员工权限上下文失败", error);
    }

    const [row] = (data || []) as EmployeePermissionContextRpcRow[];
    if (!row?.employee) {
      return {
        employee: null,
        roles: [],
        rolePermissions: [],
        overrides: [],
      };
    }

    return {
      employee: row.employee,
      roles: row.roles || [],
      rolePermissions: row.role_permissions || [],
      overrides: row.overrides || [],
    };
  }

  private async getEmployeePermissionContextForEmployee(
    employee: EmployeePermissionContextRecord["employee"],
    employeeId: string,
  ): Promise<EmployeePermissionContextRecord> {
    if (!employee) {
      return {
        employee: null,
        roles: [],
        rolePermissions: [],
        overrides: [],
      };
    }

    const [roleResult, overrides] = await Promise.all([
      this.listEmployeeRolesWithPermissions(employeeId),
      this.listEmployeePermissionOverrides(employeeId),
    ]);

    return {
      employee,
      roles: roleResult.roles,
      rolePermissions: roleResult.rolePermissions,
      overrides,
    };
  }

  async getEmployeePermissionContextByAuthUserId(
    authUserId: string,
  ): Promise<EmployeePermissionContextRecord> {
    const employee = await this.findEmployeeByAuthUserId(authUserId);
    if (!employee) {
      return {
        employee: null,
        roles: [],
        rolePermissions: [],
        overrides: [],
      };
    }

    return this.getEmployeePermissionContextForEmployee(
      employee as EmployeePermissionContextRecord["employee"],
      employee.id,
    );
  }
}

export const permissionRepository = new PermissionRepository();
