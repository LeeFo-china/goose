import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type WechatAuthEmployeeRoleRow = {
  id: string;
  status: string | null;
  tenant:
    | { id?: string | null; status?: string | null }
    | Array<{ id?: string | null; status?: string | null }>
    | null;
};

export type WechatAuthCustomerRoleRow = {
  id: string;
  tenant:
    | { id?: string | null; status?: string | null }
    | Array<{ id?: string | null; status?: string | null }>
    | null;
};

class WechatAuthRoleRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async listEmployeesByIds(employeeIds: string[]) {
    if (employeeIds.length === 0) {
      return [] as WechatAuthEmployeeRoleRow[];
    }

    const { data, error } = await this.adminClient
      .from("employees")
      .select(`
        id,
        status,
        tenant:tenants!employees_tenant_id_fkey(
          id,
          status
        )
      `)
      .in("id", employeeIds);

    if (error) {
      throw Errors.dbError("查询员工业务身份失败", error);
    }

    return (data || []) as unknown as WechatAuthEmployeeRoleRow[];
  }

  async listCustomersByIds(customerIds: string[]) {
    if (customerIds.length === 0) {
      return [] as WechatAuthCustomerRoleRow[];
    }

    const { data, error } = await this.adminClient
      .from("customers")
      .select(`
        id,
        tenant:tenants!customers_tenant_id_fkey(
          id,
          status
        )
      `)
      .in("id", customerIds);

    if (error) {
      throw Errors.dbError("查询客户业务身份失败", error);
    }

    return (data || []) as unknown as WechatAuthCustomerRoleRow[];
  }

  async listLegacyActiveEmployeesByAuthUserId(authUserId: string) {
    const { data, error } = await this.adminClient
      .from("employees")
      .select("id, status")
      .eq("user_id", authUserId)
      .eq("status", "active")
      .limit(1);

    if (error) {
      throw Errors.dbError("查询员工业务身份失败", error);
    }

    return (data || []) as Array<{ id: string; status: string | null }>;
  }

  async listLegacyCustomersByAuthUserId(authUserId: string) {
    const { data, error } = await this.adminClient
      .from("customers")
      .select(`
        id,
        tenant:tenants!customers_tenant_id_fkey(
          id,
          status
        )
      `)
      .eq("user_id", authUserId)
      .limit(2);

    if (error) {
      throw Errors.dbError("查询客户业务身份失败", error);
    }

    return (data || []) as unknown as WechatAuthCustomerRoleRow[];
  }
}

export const wechatAuthRoleRepository = new WechatAuthRoleRepository();
