import type { PropertyListQuery } from "@/schema/properties";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

class PropertyService {
  async listProperties(params: PropertyListQuery, tenantId?: string | null) {
    const { page, pageSize, customer_id } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = SupabaseDB.from("properties")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    if (customer_id) {
      query = query.eq("customer_id", customer_id);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw Errors.dbError("房产列表查询失败", error);
    }

    return {
      list: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }
}

export const propertySer = new PropertyService();
