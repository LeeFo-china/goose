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

export async function listEmployeeRolesWithPermissions(this: any, employeeId: string) {
  const { data, error } = await this.adminClient
    .from("employee_roles")
    .select(`
      role:roles!inner (
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
            code,
            status
          )
        )
      )
    `)
    .eq("employee_id", employeeId)
    .eq("role.status", "active");

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
      if (!item.permission?.code || item.permission.status !== "active") continue;
      rolePermissions.push({
        code: item.permission.code,
        scope: item.access_scope,
      });
    }
  }

  return { roles, rolePermissions };
}

export async function getEmployeePermissionContextByEmployeeId(this: any,
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

export async function getEmployeePermissionContextForEmployee(this: any,
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

export async function getEmployeePermissionContextByAuthUserId(this: any,
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
