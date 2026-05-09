import { Errors } from "@/errors/error-factory";
import type {
  TenantShareLinkCreateInput,
  TenantShareLinkListQuery,
} from "@/schema/tenant-share-links";
import { SupabaseDB } from "@/utils/supabase";

export type TenantShareLinkRecord = {
  id: string;
  tenant_id: string;
  share_employee_id: string;
  source: string;
  target_type: string;
  target_id: string | null;
  token: string;
  status: string;
  expires_at: string | null;
  metadata: unknown;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantShareLinkPublicRecord = TenantShareLinkRecord & {
  tenant?: { id: string; name: string | null; slug: string | null; status: string | null } | null;
  share_employee?: { id: string; name: string | null; phone: string | null } | null;
};

export type BindCustomerFromTenantShareResult = {
  tenant_id: string;
  customer_id: string;
  share_link_id: string;
  share_employee_id: string;
  dedupe_result: "existing_customer" | "created_customer";
  source: string;
  status: "bound";
};

class TenantShareLinkRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  async create(input: TenantShareLinkCreateInput & {
    tenantId: string;
    shareEmployeeId: string;
    token: string;
  }) {
    const { data, error } = await this.from("tenant_share_links")
      .insert({
        tenant_id: input.tenantId,
        share_employee_id: input.shareEmployeeId,
        source: input.source,
        target_type: input.target_type,
        target_id: input.target_id ?? null,
        token: input.token,
        expires_at: input.expires_at ?? null,
        metadata: input.metadata ?? {},
        status: "active",
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建员工分享链接失败", error);
    }

    return data as TenantShareLinkRecord;
  }

  async list(input: TenantShareLinkListQuery & {
    tenantId: string;
    employeeId: string;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;

    let query = this.from("tenant_share_links")
      .select("*", { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .eq("share_employee_id", input.employeeId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.source) query = query.eq("source", input.source);
    if (input.target_type) query = query.eq("target_type", input.target_type);
    if (input.status) query = query.eq("status", input.status);

    const { data, error, count } = await query;
    if (error) {
      throw Errors.dbError("查询员工分享链接失败", error);
    }

    return {
      list: (data || []) as TenantShareLinkRecord[],
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  async findPublicByToken(token: string) {
    const { data, error } = await this.from("tenant_share_links")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询员工分享链接失败", error);
    }

    const record = (data || null) as TenantShareLinkRecord | null;
    if (!record) return null;

    const [tenant, employee] = await Promise.all([
      this.findTenant(record.tenant_id),
      this.findEmployee(record.share_employee_id),
    ]);

    return {
      ...record,
      tenant,
      share_employee: employee,
    };
  }

  async bindCustomer(input: {
    authUserId: string;
    phone: string;
    shareToken: string;
  }) {
    const { data, error } = await this.client.rpc(
      "bind_customer_from_tenant_share",
      {
        p_auth_user_id: input.authUserId,
        p_phone: input.phone,
        p_share_token: input.shareToken,
      },
    );

    if (error) {
      throw error;
    }

    return data as BindCustomerFromTenantShareResult;
  }

  private async findTenant(id: string) {
    const { data, error } = await this.from("tenants")
      .select("id,name,slug,status")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询分享链接租户失败", error);
    }

    return data as TenantShareLinkPublicRecord["tenant"] | null;
  }

  private async findEmployee(id: string) {
    const { data, error } = await this.from("employees")
      .select("id,name,phone")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询分享链接员工失败", error);
    }

    return data as TenantShareLinkPublicRecord["share_employee"] | null;
  }
}

export const tenantShareLinkRepository = new TenantShareLinkRepository();
