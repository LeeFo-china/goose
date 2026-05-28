import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type WechatAuthEmployeeRoleRow = {
  id: string;
  user_id: string | null;
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
        user_id,
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

}

export const wechatAuthRoleRepository = new WechatAuthRoleRepository();
