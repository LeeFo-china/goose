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
import { getDirectPostgresSql } from "@/utils/postgres-direct";

export async function findEmployeeById(this: any, id: string) {
  const { data, error } = await this.adminClient
    .from("employees")
    .select(`
      id,
      user_id,
      tenant_id,
      status,
      admin_auth_version,
      tenant_department_id,
      post_id,
      name,
      phone,
      avatar,
      tenant:tenants!employees_tenant_id_fkey(id, name, slug, status),
      tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code),
      post:posts!employees_post_id_fkey(name)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询员工失败", error);
  }

  return data;
}

export async function findEmployeeByAuthUserId(this: any, authUserId: string) {
  const { data, error } = await this.adminClient
    .from("employees")
    .select(`
      id,
      user_id,
      tenant_id,
      status,
      admin_auth_version,
      tenant_department_id,
      post_id,
      name,
      phone,
      avatar,
      tenant:tenants!employees_tenant_id_fkey(id, name, slug, status),
      tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code),
      post:posts!employees_post_id_fkey(name)
    `)
    .eq("user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询员工失败", error);
  }

  return data;
}

export async function listEmployeeRoles(this: any, employeeId: string): Promise<RoleRecord[]> {
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

export async function listEmployeeRoleIds(this: any, employeeId: string) {
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

export async function listEmployeeIdsByDepartmentId(this: any, departmentId: string, tenantId?: string | null) {
  let query = this.adminClient
    .from("employees")
    .select("id")
    .eq("tenant_department_id", departmentId);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;

  if (error) {
    throw Errors.dbError("查询部门员工失败", error);
  }

  return ((data || []) as Array<{ id: string }>).map((item) => item.id);
}

export async function listTenantSystemAdminEmployeeIds(this: any, tenantId?: string | null) {
  if (!tenantId) {
    return [] as string[];
  }

  const { data: roleRows, error: roleError } = await this.adminClient
    .from("roles")
    .select("id")
    .eq("code", "system_admin")
    .eq("status", "active");

  if (roleError) {
    throw Errors.dbError("查询系统管理员角色失败", roleError);
  }

  const roleIds = ((roleRows || []) as Array<{ id: string | null }>)
    .map((item) => item.id)
    .filter((item): item is string => Boolean(item));
  if (roleIds.length === 0) {
    return [] as string[];
  }

  const { data: employeeRoleRows, error: employeeRoleError } =
    await this.adminClient
      .from("employee_roles")
      .select("employee_id")
      .in("role_id", roleIds);

  if (employeeRoleError) {
    throw Errors.dbError("查询系统管理员员工失败", employeeRoleError);
  }

  const employeeIds = ((employeeRoleRows || []) as Array<{
    employee_id: string | null;
  }>)
    .map((item) => item.employee_id)
    .filter((item): item is string => Boolean(item));
  if (employeeIds.length === 0) {
    return [] as string[];
  }

  const { data, error } = await this.adminClient
    .from("employees")
    .select("id")
    .in("id", Array.from(new Set(employeeIds)))
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  if (error) {
    throw Errors.dbError("查询系统管理员员工失败", error);
  }

  return ((data || []) as Array<{ id: string }>).map((item) => item.id);
}

export async function listVisibleProjectIds(this: any, params: {
  scope: "self" | "department" | "assigned" | "all";
  employeeId: string;
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
  const departmentScopeId = params.tenantDepartmentId ?? null;
  if (params.scope === "department" && departmentScopeId) {
    employeeIds = await this.listEmployeeIdsByDepartmentId(
      departmentScopeId,
      params.tenantId,
    );
  } else if (params.scope === "department") {
    employeeIds = [];
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

export async function findProjectTenantById(this: any, projectId: string) {
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

export async function canAccessProjectByScope(this: any, input: {
  projectId: string;
  tenantId: string;
  scope: "self" | "department" | "assigned" | "all";
  employeeId: string;
  tenantDepartmentId?: string | null;
}) {
  const directSql = getDirectPostgresSql();
  if (!directSql) return null;

  const rows = await directSql`
    SELECT EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id = ${input.projectId}::uuid
        AND project.tenant_id = ${input.tenantId}::uuid
        AND (
          ${input.scope}::text = 'all'
          OR (
            ${input.scope}::text IN ('self', 'assigned')
            AND (
              EXISTS (
                SELECT 1
                FROM public.project_members AS member
                WHERE member.project_id = project.id
                  AND member.employee_id = ${input.employeeId}::uuid
                  AND member.deleted_at IS NULL
              )
              OR EXISTS (
                SELECT 1
                FROM public.customers AS customer
                WHERE customer.id = project.customer_id
                  AND customer.owner_id = ${input.employeeId}::uuid
                  AND customer.tenant_id = ${input.tenantId}::uuid
              )
            )
          )
          OR (
            ${input.scope}::text = 'department'
            AND ${input.tenantDepartmentId ?? null}::uuid IS NOT NULL
            AND (
              EXISTS (
                SELECT 1
                FROM public.project_members AS member
                JOIN public.employees AS employee
                  ON employee.id = member.employee_id
                  AND employee.tenant_id = ${input.tenantId}::uuid
                WHERE member.project_id = project.id
                  AND member.deleted_at IS NULL
                  AND employee.tenant_department_id = ${input.tenantDepartmentId ?? null}::uuid
              )
              OR EXISTS (
                SELECT 1
                FROM public.customers AS customer
                JOIN public.employees AS owner
                  ON owner.id = customer.owner_id
                  AND owner.tenant_id = ${input.tenantId}::uuid
                WHERE customer.id = project.customer_id
                  AND customer.tenant_id = ${input.tenantId}::uuid
                  AND owner.tenant_department_id = ${input.tenantDepartmentId ?? null}::uuid
              )
            )
          )
        )
    ) AS allowed
  `;

  return Boolean((rows[0] as { allowed?: boolean } | undefined)?.allowed);
}

export async function hasActiveProjectMember(this: any, input: {
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

export async function replaceEmployeeRoles(this: any, employeeId: string, input: AssignEmployeeRolesInput) {
  const targetRoleIds = Array.from(new Set(input.role_ids));
  const existingRoleIds: string[] = await this.withRetry(
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
