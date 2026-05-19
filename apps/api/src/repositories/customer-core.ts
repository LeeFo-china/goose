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

export type CustomerCoreAccessRow = {
  id: string;
  owner_id: string | null;
  property_id?: string | null;
  tenant_id?: string | null;
  source?: string | null;
  douyin_screenshot_images?: unknown;
};

export type CustomerCoreRow = CustomerCoreAccessRow & {
  owner?: unknown;
  avatar?: string | null;
  source?: string | null;
  phone?: string | null;
  douyin_screenshot_images?: unknown;
};

class CustomerCoreRepository {
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
      .select("id, owner_id, property_id, tenant_id, source, douyin_screenshot_images")
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
