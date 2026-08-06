import { Errors } from "@/errors/error-factory";
import type {
  CreatePlatformOperatorInput,
  PlatformOperatorActionInput,
  PlatformOperatorListQuery,
  ReplacePlatformOperatorRolesInput,
  UpdatePlatformOperatorInput,
} from "@/schema/platform-operators";
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
  limit: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type PlatformOperatorTable = "employees" | "employee_roles";

type UntypedClient = {
  from: (table: PlatformOperatorTable) => UntypedTable;
  rpc: (functionName: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: unknown;
  }>;
};

export type PlatformOperatorStatus =
  | "pending"
  | "active"
  | "suspended"
  | "leaved";

export type PlatformOperatorRoleRecord = {
  id: string;
  code: string;
  name: string | null;
  description?: string | null;
  status: string | null;
};

export type PlatformOperatorRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  status: PlatformOperatorStatus | string | null;
  last_login_time: string | null;
  created_at: string | null;
  version: number | null;
  admin_auth_version: number | null;
  roles: PlatformOperatorRoleRecord[];
};

type EmployeeRow = Omit<PlatformOperatorRecord, "roles">;

type EmployeeRoleRow = {
  employee_id: string;
  role?: PlatformOperatorRoleRecord | PlatformOperatorRoleRecord[] | null;
};

export type PlatformOperatorPage = {
  list: PlatformOperatorRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

const EMPLOYEE_SELECT = [
  "id",
  "name",
  "phone",
  "status",
  "last_login_time",
  "created_at",
  "version",
  "admin_auth_version",
].join(",");

const ROLE_SELECT = [
  "employee_id",
  "role:roles(id, code, name, description, status)",
].join(", ");

export class PlatformOperatorsRepository {
  private from(table: PlatformOperatorTable) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  private rpc(functionName: string, args: Record<string, unknown>) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).rpc(
      functionName,
      args,
    );
  }

  async list(query: PlatformOperatorListQuery): Promise<PlatformOperatorPage> {
    const offset = (query.page - 1) * query.pageSize;
    const to = offset + query.pageSize - 1;

    let request = this.from("employees")
      .select(`${EMPLOYEE_SELECT}, employee_roles!inner(role_id)`, { count: "exact" })
      .is("tenant_id", null)
      .order("created_at", { ascending: false })
      .range(offset, to);

    if (query.status) request = request.eq("status", query.status);
    if (query.roleId) {
      request = request.eq("employee_roles.role_id", query.roleId);
    }
    if (query.keyword) {
      const keyword = query.keyword.replace(/[,()]/g, " ").trim();
      if (keyword) {
        request = request.or(
          `name.ilike.%${keyword}%,phone.ilike.%${keyword}%`,
        );
      }
    }

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询平台运营人员失败", error);

    const rows = (data || []) as EmployeeRow[];
    const rolesByEmployeeId = await this.listRolesByEmployeeIds(
      rows.map((row) => row.id),
    );
    const list = rows
      .map((row) => ({
        ...row,
        roles: rolesByEmployeeId.get(row.id) ?? [],
      }));

    return {
      list,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count ?? list.length,
        totalPages: count ? Math.ceil(count / query.pageSize) : 0,
      },
    };
  }

  async findById(operatorId: string): Promise<PlatformOperatorRecord | null> {
    const { data, error } = await this.from("employees")
      .select(EMPLOYEE_SELECT)
      .eq("id", operatorId)
      .is("tenant_id", null)
      .maybeSingle();

    if (error) throw Errors.dbError("查询平台运营人员详情失败", error);
    if (!data) return null;

    const row = data as EmployeeRow;
    const rolesByEmployeeId = await this.listRolesByEmployeeIds([row.id]);
    const roles = rolesByEmployeeId.get(row.id) ?? [];
    const hasPlatformRole = roles.some(
      (role) =>
        role.status === "active"
        && (role.code === "platform_staff"
          || role.code === "platform_admin"
          || role.code?.startsWith("platform_")),
    );
    if (!hasPlatformRole) return null;

    return {
      ...row,
      roles,
    };
  }

  async createCommand(
    authContext: PlatformStaffAuthContext,
    input: CreatePlatformOperatorInput,
  ): Promise<unknown> {
    return this.callRpc("create_platform_operator", {
      p_actor_employee_id: authContext.employeeId,
      p_actor_user_id: authContext.authUserId,
      p_idempotency_key: input.idempotency_key,
      p_name: input.name,
      p_phone: input.phone,
      p_role_ids: input.role_ids,
      p_status: input.status,
    }, "创建平台运营人员失败");
  }

  async updateCommand(
    authContext: PlatformStaffAuthContext,
    operatorId: string,
    input: UpdatePlatformOperatorInput,
  ): Promise<unknown> {
    return this.callRpc("update_platform_operator", {
      p_actor_employee_id: authContext.employeeId,
      p_actor_user_id: authContext.authUserId,
      p_operator_id: operatorId,
      p_expected_version: input.expected_version,
      p_idempotency_key: input.idempotency_key,
      p_name: input.name ?? null,
      p_phone: input.phone ?? null,
      p_status: input.status ?? null,
    }, "更新平台运营人员失败");
  }

  async replaceRolesCommand(
    authContext: PlatformStaffAuthContext,
    operatorId: string,
    input: ReplacePlatformOperatorRolesInput,
  ): Promise<unknown> {
    return this.callRpc("replace_platform_operator_roles", {
      p_actor_employee_id: authContext.employeeId,
      p_actor_user_id: authContext.authUserId,
      p_operator_id: operatorId,
      p_expected_version: input.expected_version,
      p_idempotency_key: input.idempotency_key,
      p_role_ids: input.role_ids,
    }, "替换平台运营人员角色失败");
  }

  async transitionStatusCommand(
    authContext: PlatformStaffAuthContext,
    operatorId: string,
    status: Exclude<PlatformOperatorStatus, "pending">,
    input: PlatformOperatorActionInput,
  ): Promise<unknown> {
    return this.callRpc("transition_platform_operator_status", {
      p_actor_employee_id: authContext.employeeId,
      p_actor_user_id: authContext.authUserId,
      p_operator_id: operatorId,
      p_expected_version: input.expected_version,
      p_idempotency_key: input.idempotency_key,
      p_target_status: status,
    }, "变更平台运营人员状态失败");
  }

  async revokeSessionsCommand(
    authContext: PlatformStaffAuthContext,
    operatorId: string,
    input: PlatformOperatorActionInput,
  ): Promise<unknown> {
    return this.callRpc("revoke_platform_operator_sessions", {
      p_actor_employee_id: authContext.employeeId,
      p_actor_user_id: authContext.authUserId,
      p_operator_id: operatorId,
      p_expected_version: input.expected_version,
      p_idempotency_key: input.idempotency_key,
    }, "吊销平台运营人员会话失败");
  }

  private async listRolesByEmployeeIds(
    employeeIds: string[],
  ): Promise<Map<string, PlatformOperatorRoleRecord[]>> {
    if (employeeIds.length === 0) {
      return new Map<string, PlatformOperatorRoleRecord[]>();
    }

    const { data, error } = await this.from("employee_roles")
      .select(ROLE_SELECT)
      .in("employee_id", employeeIds);

    if (error) throw Errors.dbError("查询平台运营人员角色失败", error);

    const rolesByEmployeeId = new Map<string, PlatformOperatorRoleRecord[]>();
    for (const item of (data || []) as EmployeeRoleRow[]) {
      const role = normalizeRoleRelation(item.role);
      if (!role) continue;
      const roles = rolesByEmployeeId.get(item.employee_id) ?? [];
      roles.push(role);
      rolesByEmployeeId.set(item.employee_id, roles);
    }

    return rolesByEmployeeId;
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

function normalizeRoleRelation(
  role: PlatformOperatorRoleRecord | PlatformOperatorRoleRecord[] | null | undefined,
) {
  if (Array.isArray(role)) return role[0] ?? null;
  return role ?? null;
}

export const platformOperatorsRepository = new PlatformOperatorsRepository();
