import { Errors } from "./shared";
import type { PlatformTenantEmployeeLite, PlatformTenantEmployeeRow, PlatformTenantRoleLite } from "./shared";

export async function findEmployeesByPhone(this: any, phone: string) {
  const { data, error } = await this.from("employees")
    .select("id,tenant_id,name,phone,status")
    .eq("phone", phone);

  if (error) {
    throw Errors.dbError("查询管理员手机号占用失败", error);
  }

  return (data || []) as Array<{
    id: string;
    tenant_id: string | null;
    name: string | null;
    phone: string | null;
    status: string | null;
  }>;
}

export async function findEmployeesByIds(this: any, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map<string, PlatformTenantEmployeeLite>();
  }

  const { data, error } = await this.from("employees")
    .select("id,tenant_id,name,phone,status,tenant_department_id,post_id,created_at")
    .in("id", uniqueIds);

  if (error) {
    throw Errors.dbError("查询租户员工信息失败", error);
  }

  return new Map(
    ((data || []) as PlatformTenantEmployeeRow[]).map((item) => [item.id, { ...item, role: null }]),
  );
}

export async function findTenantAdminEmployees(this: any, tenantId: string) {
  const { data: roles, error: roleError } = await this.from("roles")
    .select("id,code")
    .eq("tenant_id", tenantId)
    .eq("code", "system_admin")
    .eq("status", "active");

  if (roleError) {
    throw Errors.dbError("查询租户管理员角色失败", roleError);
  }

  const roleIds = ((roles || []) as Array<{ id: string; code: string | null }>).map((item) => item.id);
  if (roleIds.length === 0) {
    return [];
  }

  const { data: employeeRoles, error: employeeRoleError } = await this.from("employee_roles")
    .select("employee_id")
    .in("role_id", roleIds);

  if (employeeRoleError) {
    throw Errors.dbError("查询租户管理员绑定失败", employeeRoleError);
  }

  const employeeIds = Array.from(
    new Set(
      ((employeeRoles || []) as Array<{ employee_id: string | null }>)
        .map((item) => item.employee_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (employeeIds.length === 0) {
    return [];
  }

  const { data, error } = await this.from("employees")
    .select("id,tenant_id,name,phone,status,tenant_department_id,post_id,created_at")
    .eq("tenant_id", tenantId)
    .in("id", employeeIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw Errors.dbError("查询租户管理员失败", error);
  }

  return ((data || []) as PlatformTenantEmployeeRow[]).map((item) => ({
    ...item,
    role: "system_admin",
  }));
}

export async function findRolesByIds(this: any, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map<string, PlatformTenantRoleLite>();
  }

  const { data, error } = await this.from("roles")
    .select("id,tenant_id,code,name,description,status,created_at")
    .in("id", uniqueIds);

  if (error) {
    throw Errors.dbError("查询租户角色信息失败", error);
  }

  return new Map(
    ((data || []) as PlatformTenantRoleLite[]).map((item) => [item.id, item]),
  );
}

export async function listTenantRoles(this: any, tenantId: string) {
  const { data, error } = await this.from("roles")
    .select("id,tenant_id,code,name,description,status,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) {
    throw Errors.dbError("查询租户角色列表失败", error);
  }

  return (data || []) as PlatformTenantRoleLite[];
}
