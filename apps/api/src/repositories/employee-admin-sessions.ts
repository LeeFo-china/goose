import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export interface EmployeeAdminSecuritySnapshot {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  status: string | null;
  phone: string | null;
  version: number;
  admin_auth_version: number;
}

const SECURITY_FIELDS = "id,tenant_id,user_id,status,phone,version,admin_auth_version";

export class EmployeeAdminSessionsRepository {
  constructor(private readonly adminClient = SupabaseDB.getAdminClient()) {}

  async findByAuthUserId(authUserId: string): Promise<EmployeeAdminSecuritySnapshot[]> {
    return this.findSnapshots("user_id", authUserId);
  }

  async findByEmployeeId(employeeId: string): Promise<EmployeeAdminSecuritySnapshot[]> {
    return this.findSnapshots("id", employeeId);
  }

  async bindFirstLogin(
    initial: EmployeeAdminSecuritySnapshot,
    authUserId: string,
  ): Promise<EmployeeAdminSecuritySnapshot[]> {
    // Compare-and-set: a concurrent phone change or binding must not transfer
    // this employee to the account created by a now-stale login attempt.
    const query = this.adminClient.from("employees")
      .update({ user_id: authUserId })
      .eq("id", initial.id)
      .is("user_id", null)
      .eq("phone", initial.phone)
      .eq("status", initial.status)
      .eq("version", initial.version)
      .eq("admin_auth_version", initial.admin_auth_version);
    const tenantQuery = initial.tenant_id === null
      ? query.is("tenant_id", null)
      : query.eq("tenant_id", initial.tenant_id);
    const { data, error } = await tenantQuery.select(SECURITY_FIELDS);
    if (error) throw Errors.dbError("绑定员工后台账号失败", error);
    return (data ?? []) as EmployeeAdminSecuritySnapshot[];
  }

  private async findSnapshots(
    column: "id" | "user_id",
    value: string,
  ): Promise<EmployeeAdminSecuritySnapshot[]> {
    // Two rows suffice to reject ambiguous mappings without loading all matches.
    const { data, error } = await this.adminClient.from("employees")
      .select(SECURITY_FIELDS)
      .eq(column, value)
      .limit(2);
    if (error) throw Errors.dbError("查询员工后台会话失败", error);
    return (data ?? []) as EmployeeAdminSecuritySnapshot[];
  }
}

export const employeeAdminSessionsRepository = new EmployeeAdminSessionsRepository();
