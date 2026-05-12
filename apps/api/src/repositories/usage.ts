import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type UsageTenantLite = {
  id: string;
  name: string;
  slug: string;
  status: string | null;
};

export type UsageTenantStatsRow = {
  id: string;
  status: string | null;
  created_at: string | null;
};

export type UsageCustomerStatsRow = {
  id: string;
  status: string | null;
  created_at: string | null;
};

export type UsageProjectStatsRow = {
  id: string;
  status: string | null;
  created_at: string | null;
};

export type UsageExpenseStatsRow = {
  id: string;
  status: string | null;
  total_amount: number | null;
  created_at: string | null;
};

class UsageRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as {
      from: (table: string) => any;
    }).from(table);
  }

  async listTenants(input: {
    page: number;
    pageSize: number;
    tenantId?: string;
    keyword?: string;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;

    let query = this.from("tenants")
      .select("id, name, slug, status", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.tenantId) {
      query = query.eq("id", input.tenantId);
    }

    if (input.keyword) {
      const escaped = input.keyword.replaceAll(",", "\\,");
      query = query.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
    }

    const { data, count, error } = await query;
    if (error) {
      throw Errors.dbError("查询租户用量列表失败", error);
    }

    return {
      list: (data || []) as UsageTenantLite[],
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  async listTenantStatsRows(input: {
    createdTo?: string;
  }) {
    let query = this.from("tenants")
      .select("id, status, created_at");

    if (input.createdTo) {
      query = query.lt("created_at", input.createdTo);
    }

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询平台租户趋势失败", error);
    }

    return (data || []) as UsageTenantStatsRow[];
  }

  async listCustomerStatsRows(input: {
    tenantId: string;
    createdTo?: string;
  }) {
    let query = this.from("customers")
      .select("id, status, created_at")
      .eq("tenant_id", input.tenantId);

    if (input.createdTo) {
      query = query.lt("created_at", input.createdTo);
    }

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询客户概览统计失败", error);
    }

    return (data || []) as UsageCustomerStatsRow[];
  }

  async listProjectStatsRows(input: {
    tenantId: string;
    createdTo?: string;
  }) {
    let query = this.from("projects")
      .select("id, status, created_at")
      .eq("tenant_id", input.tenantId);

    if (input.createdTo) {
      query = query.lt("created_at", input.createdTo);
    }

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询项目概览统计失败", error);
    }

    return (data || []) as UsageProjectStatsRow[];
  }

  async listExpenseStatsRows(input: {
    tenantId: string;
    createdTo?: string;
  }) {
    let query = this.from("expense_requests")
      .select("id, status, total_amount, created_at")
      .eq("tenant_id", input.tenantId);

    if (input.createdTo) {
      query = query.lt("created_at", input.createdTo);
    }

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询费用概览统计失败", error);
    }

    return (data || []) as UsageExpenseStatsRow[];
  }
}

export const usageRepository = new UsageRepository();
