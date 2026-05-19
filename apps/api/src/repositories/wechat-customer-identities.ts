import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type WechatCustomerIdentityRow = {
  id: string;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  tenant_id: string | null;
  customer_origin?: string | null;
  claimed_at?: string | null;
};

export type WechatCustomerTenantOption = WechatCustomerIdentityRow & {
  tenant: {
    id: string | null;
    name: string | null;
    slug: string | null;
    status: string | null;
  } | Array<{
    id: string | null;
    name: string | null;
    slug: string | null;
    status: string | null;
  }> | null;
  project_count?: number;
  latest_project_name?: string | null;
};

export type WechatCustomerProjectSummaryRow = {
  id: string;
  name: string | null;
  customer_id: string | null;
  created_at: string | null;
};

class WechatCustomerIdentityRepository {
  private adminClient = SupabaseDB.getAdminClient();

  private customerTenantSelect = `
    id,
    name,
    phone,
    user_id,
    tenant_id,
    customer_origin,
    claimed_at,
    tenant:tenants!customers_tenant_id_fkey(
      id,
      name,
      slug,
      status
    )
  `;

  async listCustomerTenantOptionsByPhone(phone: string) {
    const { data, error } = await this.adminClient
      .from("customers")
      .select(this.customerTenantSelect)
      .eq("phone", phone);

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    return (data || []) as unknown as WechatCustomerTenantOption[];
  }

  async listCustomerTenantOptionsByAuthUserId(authUserId: string) {
    const { data, error } = await this.adminClient
      .from("customers")
      .select(this.customerTenantSelect)
      .eq("user_id", authUserId);

    if (error) {
      throw Errors.dbError("查询客户微信绑定失败", error);
    }

    return (data || []) as unknown as WechatCustomerTenantOption[];
  }

  async listCustomerTenantOptionsByIds(customerIds: string[]) {
    if (customerIds.length === 0) {
      return [] as WechatCustomerTenantOption[];
    }

    const { data, error } = await this.adminClient
      .from("customers")
      .select(this.customerTenantSelect)
      .in("id", customerIds);

    if (error) {
      throw Errors.dbError("查询客户业务身份失败", error);
    }

    return (data || []) as unknown as WechatCustomerTenantOption[];
  }

  async getCustomerTenantOptionById(customerId: string, tenantId: string) {
    const { data, error } = await this.adminClient
      .from("customers")
      .select(this.customerTenantSelect)
      .eq("id", customerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    return (data || null) as unknown as WechatCustomerTenantOption | null;
  }

  async listProjectSummariesByCustomerIds(customerIds: string[]) {
    if (customerIds.length === 0) {
      return [] as WechatCustomerProjectSummaryRow[];
    }

    const { data, error } = await this.adminClient
      .from("projects")
      .select("id, name, customer_id, created_at")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询客户项目概览失败", error);
    }

    return (data || []) as WechatCustomerProjectSummaryRow[];
  }
}

export const wechatCustomerIdentityRepository =
  new WechatCustomerIdentityRepository();
