import {
  Errors,
  type AssignEmployeeRolesInput,
  type CreatePermissionInput,
  type CreateRoleInput,
  type EmployeePermissionContextRecord,
  type EmployeePermissionContextRpcRow,
  type EmployeePermissionOverrideInput,
  type PermissionListQueryType,
  type PermissionRecord,
  type RoleListQueryType,
  type RolePermissionAssignInput,
  type RolePermissionRecord,
  type RoleRecord,
  type RoleWithPermissionsRecord,
  type UpdatePermissionInput,
  type UpdateRoleInput,
} from "./shared";

export async function listRoles(this: any, params: RoleListQueryType, tenantId?: string | null) {
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

export async function findRoleById(this: any, id: string, tenantId?: string | null): Promise<RoleRecord | null> {
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

export async function listRolePermissionRecords(this: any, roleId: string): Promise<RolePermissionRecord[]> {
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

export async function createRole(this: any, input: CreateRoleInput & { tenant_id?: string | null }): Promise<RoleRecord> {
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

export async function updateRole(this: any,
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

export async function listRolesByIds(this: any, roleIds: string[], tenantId?: string | null): Promise<RoleRecord[]> {
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

export async function listEmployeesByRoleId(this: any, roleId: string) {
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

export async function replaceRolePermissions(this: any, roleId: string, input: RolePermissionAssignInput) {
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
