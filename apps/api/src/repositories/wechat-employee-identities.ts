import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { SupabaseDB } from "@/utils/supabase";

export type WechatEmployeeIdentityRow = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  phone: string | null;
  status: string | null;
  version: number;
  tenant:
    | { id: string | null; status: string | null }
    | Array<{ id: string | null; status: string | null }>
    | null;
};

const EMPLOYEE_LOGIN_CANDIDATE_SELECT = `
  id,
  tenant_id,
  user_id,
  phone,
  status,
  version,
  tenant:tenants!employees_tenant_id_fkey(id, status)
`;

export class WechatEmployeeIdentityRepository {
  constructor(private readonly adminClient = SupabaseDB.getAdminClient()) {}

  async listEmployeeLoginCandidatesByPhone(phone: string) {
    const { data, error } = await this.adminClient
      .from("employees")
      .select(EMPLOYEE_LOGIN_CANDIDATE_SELECT)
      .eq("phone", phone)
      .limit(2); // The caller requires exactly one employee; two detect ambiguity.

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
    expected: Pick<WechatEmployeeIdentityRow, "phone" | "version" | "user_id" | "tenant_id" | "status">;
    errorMessage?: string;
  }) {
    if (!Number.isSafeInteger(input.expected.version) || input.expected.version < 1) {
      throw Errors.business(409, "所选身份不可用，请重新验证手机号", ErrorCodes.IDENTITY_OPTION_UNAVAILABLE);
    }
    // This compare-and-set is the authorization point for a phone-verified bind.
    // A no-op user_id update also guards OAuth/membership changes on bound accounts.
    const query = this.adminClient
      .from("employees")
      .update({ user_id: input.authUserId })
      .eq("id", input.employeeId)
      .eq("phone", input.expected.phone)
      .eq("version", input.expected.version)
      .eq("status", input.expected.status);
    const tenantQuery = input.expected.tenant_id === null
      ? query.is("tenant_id", null) : query.eq("tenant_id", input.expected.tenant_id);
    const bindingQuery = input.expected.user_id === null
      ? tenantQuery.is("user_id", null) : tenantQuery.eq("user_id", input.expected.user_id);
    const { data, error } = await bindingQuery.select("id").maybeSingle();

    if (error) {
      throw Errors.dbError(input.errorMessage || "绑定员工身份失败", error);
    }
    if (!data) {
      throw Errors.business(409, "所选身份不可用，请重新验证手机号", ErrorCodes.IDENTITY_OPTION_UNAVAILABLE);
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
