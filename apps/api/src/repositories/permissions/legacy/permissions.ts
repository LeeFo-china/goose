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

export async function listPermissions(this: any, params: PermissionListQueryType) {
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

export async function findPermissionById(this: any, id: string): Promise<PermissionRecord | null> {
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

export async function findPermissionByCode(this: any, code: string): Promise<PermissionRecord | null> {
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

export async function createPermission(this: any, input: CreatePermissionInput): Promise<PermissionRecord> {
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

export async function updatePermission(this: any,
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
