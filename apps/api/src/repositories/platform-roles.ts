import { Errors } from "@/errors/error-factory";
import type {
  CreatePlatformRoleInput,
  PlatformPermissionListQuery,
  PlatformRoleActionInput,
  PlatformRoleListQuery,
  ReplacePlatformRolePermissionsInput,
  UpdatePlatformRoleInput,
} from "@/schema/platform-roles";
import type { PlatformStaffAuthContext } from "@/services/platform-authorization";
import { SupabaseDB } from "@/utils/supabase";

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  is: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type PlatformRoleTable =
  | "roles"
  | "permissions"
  | "role_permissions"
  | "employee_roles";

type UntypedClient = {
  from: (table: PlatformRoleTable) => UntypedTable;
  rpc: (functionName: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: unknown;
  }>;
};

export type PlatformPermissionRecord = {
  id: string;
  code: string;
  name: string | null;
  module: string | null;
  resource: string | null;
  action: string | null;
  description?: string | null;
  status: string | null;
  access_scope?: string;
};

export type PlatformRoleRecord = {
  id: string;
  tenant_id: string | null;
  code: string;
  name: string | null;
  description: string | null;
  status: string | null;
  version: number | null;
  created_at: string | null;
  updated_at: string | null;
  permission_count: number;
  employee_count: number;
  permissions?: PlatformPermissionRecord[];
};

type RolePermissionRow = {
  role_id: string;
  access_scope?: string;
  permission?: PlatformPermissionRecord | PlatformPermissionRecord[] | null;
};

type EmployeeRoleRow = {
  role_id: string;
};

type PlatformRolePage = {
  list: PlatformRoleRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type PlatformPermissionPage = {
  list: PlatformPermissionRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

const ROLE_SELECT = [
  "id",
  "tenant_id",
  "code",
  "name",
  "description",
  "status",
  "version",
  "created_at",
  "updated_at",
].join(",");

const PERMISSION_SELECT = [
  "id",
  "code",
  "name",
  "module",
  "resource",
  "action",
  "description",
  "status",
].join(",");

const PLATFORM_ROLE_CODE_FILTER =
  "code.eq.platform_admin,code.eq.platform_staff,code.ilike.platform_custom_%";

export class PlatformRolesRepository {
  private from(table: PlatformRoleTable) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  private rpc(functionName: string, args: Record<string, unknown>) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).rpc(
      functionName,
      args,
    );
  }

  async listRoles(query: PlatformRoleListQuery): Promise<PlatformRolePage> {
    const offset = (query.page - 1) * query.pageSize;
    const to = offset + query.pageSize - 1;

    let request = this.from("roles")
      .select(ROLE_SELECT, { count: "exact" })
      .is("tenant_id", null)
      .or(PLATFORM_ROLE_CODE_FILTER)
      .order("created_at", { ascending: false })
      .range(offset, to);

    if (query.status) request = request.eq("status", query.status);
    if (query.keyword) {
      const keyword = query.keyword.replace(/[,()]/g, " ").trim();
      if (keyword) {
        request = request.or(
          `code.ilike.%${keyword}%,name.ilike.%${keyword}%`,
        );
      }
    }

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询平台角色失败", error);

    const roles = (data || []) as Array<Omit<PlatformRoleRecord, "permission_count" | "employee_count">>;
    const roleIds = roles.map((role) => role.id);
    const [permissionCounts, employeeCounts] = await Promise.all([
      this.countPermissionsByRoleIds(roleIds),
      this.countActiveEmployeesByRoleIds(roleIds),
    ]);

    return {
      list: roles.map((role) => ({
        ...role,
        permission_count: permissionCounts.get(role.id) ?? 0,
        employee_count: employeeCounts.get(role.id) ?? 0,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / query.pageSize) : 0,
      },
    };
  }

  async findRoleById(roleId: string): Promise<PlatformRoleRecord | null> {
    const { data, error } = await this.from("roles")
      .select(ROLE_SELECT)
      .eq("id", roleId)
      .is("tenant_id", null)
      .maybeSingle();

    if (error) throw Errors.dbError("查询平台角色详情失败", error);
    if (!data) return null;

    const role = data as Omit<PlatformRoleRecord, "permission_count" | "employee_count">;
    if (!isPlatformRoleCode(role.code)) return null;

    const [permissions, permissionCounts, employeeCounts] = await Promise.all([
      this.listRolePermissions(roleId),
      this.countPermissionsByRoleIds([roleId]),
      this.countActiveEmployeesByRoleIds([roleId]),
    ]);

    return {
      ...role,
      permissions,
      permission_count: permissionCounts.get(roleId) ?? 0,
      employee_count: employeeCounts.get(roleId) ?? 0,
    };
  }

  async listPermissions(
    query: PlatformPermissionListQuery,
  ): Promise<PlatformPermissionPage> {
    const offset = (query.page - 1) * query.pageSize;
    const to = offset + query.pageSize - 1;

    let request = this.from("permissions")
      .select(PERMISSION_SELECT, { count: "exact" })
      .eq("status", "active")
      .or("code.ilike.platform.%")
      .order("module", { ascending: true })
      .order("resource", { ascending: true })
      .order("action", { ascending: true })
      .range(offset, to);

    if (query.module) request = request.eq("module", query.module);
    if (query.keyword) {
      const keyword = query.keyword.replace(/[,()]/g, " ").trim();
      if (keyword) {
        request = request.or(
          `code.ilike.%${keyword}%,name.ilike.%${keyword}%,module.ilike.%${keyword}%`,
        );
      }
    }

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询平台权限目录失败", error);

    return {
      list: (data || []) as PlatformPermissionRecord[],
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / query.pageSize) : 0,
      },
    };
  }

  async createCommand(
    authContext: PlatformStaffAuthContext,
    input: CreatePlatformRoleInput,
  ): Promise<unknown> {
    return this.callRpc("create_platform_role", {
      p_actor_employee_id: authContext.employeeId,
      p_actor_user_id: authContext.authUserId,
      p_idempotency_key: input.idempotency_key,
      p_name: input.name,
      p_description: input.description ?? null,
      p_permission_ids: input.permission_ids,
    }, "创建平台角色失败");
  }

  async updateCommand(
    authContext: PlatformStaffAuthContext,
    roleId: string,
    input: UpdatePlatformRoleInput,
  ): Promise<unknown> {
    return this.callRpc("update_platform_role", {
      p_actor_employee_id: authContext.employeeId,
      p_actor_user_id: authContext.authUserId,
      p_role_id: roleId,
      p_expected_version: input.expected_version,
      p_idempotency_key: input.idempotency_key,
      p_name: input.name ?? null,
      p_description: input.description ?? null,
    }, "更新平台角色失败");
  }

  async replacePermissionsCommand(
    authContext: PlatformStaffAuthContext,
    roleId: string,
    input: ReplacePlatformRolePermissionsInput,
  ): Promise<unknown> {
    return this.callRpc("replace_platform_role_permissions", {
      p_actor_employee_id: authContext.employeeId,
      p_actor_user_id: authContext.authUserId,
      p_role_id: roleId,
      p_expected_version: input.expected_version,
      p_idempotency_key: input.idempotency_key,
      p_permission_ids: input.permissions.map((permission) =>
        permission.permission_id
      ),
    }, "替换平台角色权限失败");
  }

  async archiveCommand(
    authContext: PlatformStaffAuthContext,
    roleId: string,
    input: PlatformRoleActionInput,
  ): Promise<unknown> {
    return this.callRpc("archive_platform_role", {
      p_actor_employee_id: authContext.employeeId,
      p_actor_user_id: authContext.authUserId,
      p_role_id: roleId,
      p_expected_version: input.expected_version,
      p_idempotency_key: input.idempotency_key,
    }, "归档平台角色失败");
  }

  private async listRolePermissions(
    roleId: string,
  ): Promise<PlatformPermissionRecord[]> {
    const { data, error } = await this.from("role_permissions")
      .select(`
        role_id,
        access_scope,
        permission:permissions (
          ${PERMISSION_SELECT}
        )
      `)
      .eq("role_id", roleId)
      .eq("permission.status", "active");

    if (error) throw Errors.dbError("查询平台角色权限失败", error);

    const permissions: PlatformPermissionRecord[] = [];
    for (const row of (data || []) as RolePermissionRow[]) {
        const permission = normalizePermissionRelation(row.permission);
        if (!permission || !permission.code.startsWith("platform.")) {
          continue;
        }
        permissions.push({
          ...permission,
          access_scope: row.access_scope ?? "all",
        });
    }

    return permissions;
  }

  private async countPermissionsByRoleIds(
    roleIds: string[],
  ): Promise<Map<string, number>> {
    if (roleIds.length === 0) return new Map<string, number>();
    const { data, error } = await this.from("role_permissions")
      .select("role_id")
      .in("role_id", roleIds);

    if (error) throw Errors.dbError("统计平台角色权限数失败", error);
    return countBy((data || []) as RolePermissionRow[], "role_id");
  }

  private async countActiveEmployeesByRoleIds(
    roleIds: string[],
  ): Promise<Map<string, number>> {
    if (roleIds.length === 0) return new Map<string, number>();
    const { data, error } = await this.from("employee_roles")
      .select(`
        role_id,
        employee:employees!employee_roles_employee_id_fkey!inner(
          id,
          tenant_id,
          status
        )
      `)
      .in("role_id", roleIds)
      .is("employee.tenant_id", null)
      .eq("employee.status", "active");

    if (error) throw Errors.dbError("统计平台角色人员数失败", error);
    return countBy((data || []) as EmployeeRoleRow[], "role_id");
  }

  private async callRpc(
    functionName: string,
    args: Record<string, unknown>,
    message: string,
  ): Promise<unknown> {
    const { data, error } = await this.rpc(functionName, args);
    if (error) throw Errors.dbError(message, error);
    return data;
  }
}

function normalizePermissionRelation(
  permission: PlatformPermissionRecord | PlatformPermissionRecord[] | null | undefined,
) {
  if (Array.isArray(permission)) return permission[0] ?? null;
  return permission ?? null;
}

function countBy<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value !== "string") continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function isPlatformRoleCode(code: string | null | undefined): boolean {
  return code === "platform_admin"
    || code === "platform_staff"
    || code?.startsWith("platform_custom_") === true;
}

export const platformRolesRepository = new PlatformRolesRepository();
