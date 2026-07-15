import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type WechatEmployeeIdentityRow = {
  id: string;
  user_id: string | null;
  status: string | null;
  tenant:
    | { id: string | null; status: string | null }
    | Array<{ id: string | null; status: string | null }>
    | null;
};

const EMPLOYEE_LOGIN_CANDIDATE_SELECT = `
  id,
  user_id,
  status,
  tenant:tenants!employees_tenant_id_fkey(id, status)
`;

class WechatEmployeeIdentityRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async listEmployeeLoginCandidatesByPhone(phone: string) {
    const { data, error } = await this.adminClient
      .from("employees")
      .select(EMPLOYEE_LOGIN_CANDIDATE_SELECT)
      .eq("phone", phone);

    if (error) {
      throw Errors.dbError("查询员工身份失败", error);
    }

    return (data || []) as unknown as WechatEmployeeIdentityRow[];
  }

  async getEmployeeLoginCandidateById(employeeId: string) {
    const { data, error } = await this.adminClient
      .from("employees")
      .select(EMPLOYEE_LOGIN_CANDIDATE_SELECT)
      .eq("id", employeeId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询员工身份失败", error);
    }

    return (data || null) as unknown as WechatEmployeeIdentityRow | null;
  }

  async bindEmployeeAuthUser(input: {
    employeeId: string;
    authUserId: string;
    errorMessage?: string;
  }) {
    const { error } = await this.adminClient
      .from("employees")
      .update({ user_id: input.authUserId })
      .eq("id", input.employeeId)
      .select("id");

    if (error) {
      throw Errors.dbError(input.errorMessage || "绑定员工身份失败", error);
    }
  }

  async clearOtherEmployeeBindings(input: {
    authUserId: string;
    exceptEmployeeId: string;
  }) {
    const { error } = await this.adminClient
      .from("employees")
      .update({ user_id: null })
      .eq("user_id", input.authUserId)
      .neq("id", input.exceptEmployeeId)
      .select("id");

    if (error) {
      throw Errors.dbError("清理历史员工绑定失败", error);
    }
  }
}

export const wechatEmployeeIdentityRepository =
  new WechatEmployeeIdentityRepository();
