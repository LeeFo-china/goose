import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export const CUSTOMER_SELECT = `
  *,
  owner:employees!customers_owner_id_fkey(
    id,
    name,
    phone
  )
`;

export const CUSTOMER_HOME_LIST_SELECT = `
  id,
  name,
  phone,
  status,
  source,
  customer_origin,
  owner_id,
  avatar,
  created_at,
  douyin_screenshot_images,
  owner:employees!customers_owner_id_fkey(
    id,
    name,
    phone
  )
`;

export type CustomerCoreAccessRow = {
  id: string;
  owner_id: string | null;
  property_id?: string | null;
  tenant_id?: string | null;
  source?: string | null;
  status?: string | null;
  douyin_screenshot_images?: unknown;
};

export type CustomerCoreRow = CustomerCoreAccessRow & {
  owner?: unknown;
  avatar?: string | null;
  source?: string | null;
  phone?: string | null;
  douyin_screenshot_images?: unknown;
};

export type CustomerListFilters = {
  tenantId: string;
  visibleOwnerIds: string[] | null;
  status?: string;
  source?: string;
  customerOrigin?: string;
  keyword?: string;
  customerIds?: string[] | null;
};

function escapeSupabaseOrValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/,/g, "\\,");
}

class CustomerCoreRepository {
  private applyCustomerListFilters(query: any, filters: CustomerListFilters) {
    let filteredQuery = query.eq("tenant_id", filters.tenantId);

    if (filters.visibleOwnerIds !== null) {
      if (filters.visibleOwnerIds.length === 0) {
        filteredQuery = filteredQuery.eq(
          "id",
          "00000000-0000-0000-0000-000000000000",
        );
      } else {
        filteredQuery = filteredQuery.in("owner_id", filters.visibleOwnerIds);
      }
    }

    if (filters.status) {
      filteredQuery = filteredQuery.eq("status", filters.status);
    }

    if (filters.source) {
      filteredQuery = filteredQuery.eq("source", filters.source);
    }

    if (filters.customerOrigin) {
      filteredQuery = filteredQuery.eq("customer_origin", filters.customerOrigin);
    }

    if (filters.keyword) {
      const escapedKeyword = escapeSupabaseOrValue(filters.keyword);
      filteredQuery = filteredQuery.or(
        [
          `name.ilike.%${escapedKeyword}%`,
          `phone.ilike.%${escapedKeyword}%`,
          `source.ilike.%${escapedKeyword}%`,
        ].join(","),
      );
    }

    if (filters.customerIds !== undefined && filters.customerIds !== null) {
      if (filters.customerIds.length === 0) {
        filteredQuery = filteredQuery.eq(
          "id",
          "00000000-0000-0000-0000-000000000000",
        );
      } else {
        filteredQuery = filteredQuery.in("id", filters.customerIds);
      }
    }

    return filteredQuery;
  }

  async listIds(filters: CustomerListFilters) {
    const query = this.applyCustomerListFilters(
      SupabaseDB.getAdminClient()
        .from("customers")
        .select("id")
        .order("created_at", { ascending: false }),
      filters,
    );

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("列表查询失败", error);
    }

    return ((data || []) as Array<{ id: string }>).map((item) => item.id);
  }

  async count(filters: CustomerListFilters) {
    const query = this.applyCustomerListFilters(
      SupabaseDB.getAdminClient()
        .from("customers")
        .select("id", { count: "exact", head: true }),
      filters,
    );

    const { error, count } = await query;
    if (error) {
      throw Errors.dbError("列表查询失败", error);
    }

    return count ?? 0;
  }

  async listRows(input: {
    filters: CustomerListFilters;
    from: number;
    to: number;
  }) {
    const query = this.applyCustomerListFilters(
      SupabaseDB.getAdminClient()
        .from("customers")
        .select(CUSTOMER_SELECT)
        .order("created_at", { ascending: false }),
      input.filters,
    );

    const { data, error } = await query.range(input.from, input.to);
    if (error) {
      throw Errors.dbError("列表查询失败", error);
    }

    return (data || []) as unknown as CustomerCoreRow[];
  }

  async listHomeRows(input: {
    filters: CustomerListFilters;
    from: number;
    to: number;
  }) {
    const query = this.applyCustomerListFilters(
      SupabaseDB.getAdminClient()
        .from("customers")
        .select(CUSTOMER_HOME_LIST_SELECT)
        .order("created_at", { ascending: false }),
      input.filters,
    );

    const { data, error } = await query.range(input.from, input.to);
    if (error) {
      throw Errors.dbError("列表查询失败", error);
    }

    return (data || []) as unknown as CustomerCoreRow[];
  }

  async listRowsByIds(input: { customerIds: string[]; tenantId: string }) {
    if (input.customerIds.length === 0) {
      return [] as CustomerCoreRow[];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select(CUSTOMER_SELECT)
      .in("id", input.customerIds)
      .eq("tenant_id", input.tenantId);

    if (error) {
      throw Errors.dbError("列表查询失败", error);
    }

    const customerOrder = new Map(
      input.customerIds.map((id, index) => [id, index]),
    );
    return ((data || []) as unknown as CustomerCoreRow[]).sort((a, b) =>
      (customerOrder.get(a.id) ?? 0) - (customerOrder.get(b.id) ?? 0)
    );
  }

  async create(payload: Record<string, unknown>) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .insert(payload)
      .select(CUSTOMER_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("创建失败", error);
    }

    return data as unknown as CustomerCoreRow;
  }

  async findById(input: { customerId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select(CUSTOMER_SELECT)
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户失败", error);
    }

    return (data as unknown as CustomerCoreRow | null) ?? null;
  }

  async findAccessById(input: { customerId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id, property_id, tenant_id, source, status, douyin_screenshot_images")
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户失败", error);
    }

    return (data as CustomerCoreAccessRow | null) ?? null;
  }

  async updateById(input: {
    customerId: string;
    tenantId: string;
    payload: Record<string, unknown>;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .update(input.payload)
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .select(CUSTOMER_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("更新失败", error);
    }

    return data as unknown as CustomerCoreRow;
  }

  async markInvalid(input: { customerId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .update({ status: "invalid" })
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .select(CUSTOMER_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("作废客户失败", error);
    }

    return data as unknown as CustomerCoreRow;
  }
}

export const customerCoreRepository = new CustomerCoreRepository();
