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

export async function listRolePermissions(this: any, roleIds: string[]) {
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

export async function listEmployeePermissionOverrides(this: any, employeeId: string) {
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

export async function upsertEmployeePermissionOverride(this: any,
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

export async function deleteEmployeePermissionOverride(this: any, employeeId: string, permissionId: string) {
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
