import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export interface PlatformAuthorizationSnapshot {
  employee_id: string;
  tenant_id: string | null;
  status: string | null;
  admin_auth_version: number;
  role_codes: string[];
}

interface EmployeeSecurityRole {
  code: string | null;
  status: string | null;
  tenant_id: string | null;
}

interface EmployeeSecurityRow {
  id: string;
  tenant_id: string | null;
  status: string | null;
  admin_auth_version: number | null;
  employee_roles?: Array<{
    role?: EmployeeSecurityRole | EmployeeSecurityRole[] | null;
  }> | null;
}

export class PlatformAuthorizationRepository {
  private readonly adminClient = SupabaseDB.getAdminClient();

  async getSecuritySnapshot(
    employeeId: string,
  ): Promise<PlatformAuthorizationSnapshot | null> {
    const { data, error } = await this.adminClient
      .from("employees")
      .select(`
        id,
        tenant_id,
        status,
        admin_auth_version,
        employee_roles (
          role:roles (
            code,
            status,
            tenant_id
          )
        )
      `)
      .eq("id", employeeId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询平台人员会话失败", error);
    }

    if (!data) {
      return null;
    }

    const row = data as unknown as EmployeeSecurityRow;
    const roleCodes = (row.employee_roles || [])
      .map((item) => normalizeRoleRelation(item.role))
      .filter((role): role is EmployeeSecurityRole & { code: string } =>
        role !== null
        && role.status === "active"
        && role.tenant_id === null
        && typeof role.code === "string"
      )
      .map((role) => role.code);

    return {
      employee_id: row.id,
      tenant_id: row.tenant_id,
      status: row.status,
      admin_auth_version: row.admin_auth_version ?? 1,
      role_codes: Array.from(new Set(roleCodes)),
    };
  }
}

export const platformAuthorizationRepository =
  new PlatformAuthorizationRepository();

function normalizeRoleRelation(
  role: EmployeeSecurityRole | EmployeeSecurityRole[] | null | undefined,
) {
  if (Array.isArray(role)) {
    return role[0] ?? null;
  }

  return role ?? null;
}
