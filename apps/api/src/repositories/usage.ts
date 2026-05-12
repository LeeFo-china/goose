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
}

export const usageRepository = new UsageRepository();
