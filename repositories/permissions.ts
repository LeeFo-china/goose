import { Errors } from "@/errors/error-factory";
import type {
  AssignEmployeeRolesInput,
  CreatePermissionInput,
  CreateRoleInput,
  EmployeePermissionOverrideInput,
  PermissionListQueryType,
  RoleListQueryType,
  UpdatePermissionInput,
  UpdateRoleInput,
} from "@/schema/permissions";
import { SupabaseDB } from "@/utils/supabase";

export type RoleRecord = {
  id: string;
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
  module: string;
  resource: string;
  action: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type EmployeePermissionContextRecord = {
  employee: {
    id: string;
    user_id: string | null;
    role: string | null;
    status: string | null;
    department_id: string | null;
    post_id: string | null;
    name: string | null;
    phone: string | null;
  } | null;
  roles: RoleRecord[];
  rolePermissions: Array<{
    code: string;
    scope: string;
  }>;
  overrides: Array<{
    code: string;
    effect: string;
    scope: string | null;
    reason: string | null;
  }>;
};

class PermissionRepository {
  private adminClient = SupabaseDB.getAdminClient();

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

  async listRoles(params: RoleListQueryType) {
    const { page, pageSize, status, keyword } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.adminClient
      .from("roles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

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

  async findRoleById(id: string): Promise<RoleRecord | null> {
    const { data, error } = await this.adminClient
      .from("roles")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询角色失败", error);
    }

    return (data as RoleRecord | null) ?? null;
  }

  async createRole(input: CreateRoleInput): Promise<RoleRecord> {
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

  async updateRole(id: string, input: UpdateRoleInput): Promise<RoleRecord> {
    const { data, error } = await this.adminClient
      .from("roles")
      .update(input)
      .eq("id", id)
      .select("*")
      .maybeSingle();

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
        `code.ilike.%${keyword}%,description.ilike.%${keyword}%,resource.ilike.%${keyword}%`,
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
      .select("id, user_id, role, status, department_id, post_id, name, phone")
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
      .select("id, user_id, role, status, department_id, post_id, name, phone")
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

  async listEmployeeIdsByDepartmentId(departmentId: string) {
    const { data, error } = await this.adminClient
      .from("employees")
      .select("id")
      .eq("department_id", departmentId);

    if (error) {
      throw Errors.dbError("查询部门员工失败", error);
    }

    return ((data || []) as Array<{ id: string }>).map((item) => item.id);
  }

  async listVisibleProjectIds(params: {
    scope: "self" | "department" | "assigned" | "all";
    employeeId: string;
    departmentId: string | null;
  }) {
    if (params.scope === "all") {
      const { data, error } = await this.adminClient
        .from("projects")
        .select("id");

      if (error) {
        throw Errors.dbError("查询项目权限范围失败", error);
      }

      return ((data || []) as Array<{ id: string }>).map((item) => item.id);
    }

    let employeeIds = [params.employeeId];
    if (params.scope === "department" && params.departmentId) {
      employeeIds = await this.listEmployeeIdsByDepartmentId(params.departmentId);
    }

    const visibleIds = employeeIds.filter(Boolean);
    if (visibleIds.length === 0) {
      return [] as string[];
    }

    const inClause = visibleIds.join(",");
    const filter = params.scope === "department"
      ? `designer_id.in.(${inClause}),supervisor_id.in.(${inClause})`
      : `designer_id.eq.${params.employeeId},supervisor_id.eq.${params.employeeId}`;

    const { data, error } = await this.adminClient
      .from("projects")
      .select("id")
      .or(filter);

    if (error) {
      throw Errors.dbError("查询项目权限范围失败", error);
    }

    return ((data || []) as Array<{ id: string }>).map((item) => item.id);
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
        effect,
        access_scope,
        reason,
        permission:permissions (
          code
        )
      `)
      .eq("employee_id", employeeId);

    if (error) {
      throw Errors.dbError("查询员工权限覆盖失败", error);
    }

    const rows = ((data || []) as unknown as Array<{
      effect: string;
      access_scope: string | null;
      reason: string | null;
      permission: { code: string } | null;
    }>);

    return rows
      .map((item) => ({
        code: item.permission?.code,
        effect: item.effect,
        scope: item.access_scope,
        reason: item.reason,
      }))
      .filter((item): item is {
        code: string;
        effect: string;
        scope: string | null;
        reason: string | null;
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
      );

      if (upsertError) {
        throw Errors.dbError("更新员工角色失败", upsertError);
      }
    }

    return this.withRetry(() => this.listEmployeeRoles(employeeId));
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
      });

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
      .eq("permission_id", permissionId);

    if (error) {
      throw Errors.dbError("删除员工权限覆盖失败", error);
    }

    return this.listEmployeePermissionOverrides(employeeId);
  }

  async getEmployeePermissionContextByEmployeeId(
    employeeId: string,
  ): Promise<EmployeePermissionContextRecord> {
    const employee = await this.findEmployeeById(employeeId);
    const roles = await this.listEmployeeRoles(employeeId);
    const roleIds = roles.map((item) => item.id);
    const [rolePermissions, overrides] = await Promise.all([
      this.listRolePermissions(roleIds),
      this.listEmployeePermissionOverrides(employeeId),
    ]);

    return {
      employee: employee || null,
      roles,
      rolePermissions,
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

    return this.getEmployeePermissionContextByEmployeeId(employee.id);
  }
}

export const permissionRepository = new PermissionRepository();
