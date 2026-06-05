import { Errors } from "@/errors/error-factory";
import type {
  CreatePropertyInput,
  PropertyListQuery,
  UpdatePropertyInput,
} from "@/schema/properties";
import { SupabaseDB } from "@/utils/supabase/index";
import type {
  PropertyLocationSource,
  PropertyLocationStatus,
} from "@gooes/domain";

export type PropertyRow = {
  id: string;
  tenant_id: string | null;
  customer_id: string | null;
  community: string;
  building_info: string | null;
  area: number | null;
  layout: string | null;
  latitude: number | null;
  longitude: number | null;
  province: string | null;
  city: string | null;
  district: string | null;
  adcode: string | null;
  location_status: PropertyLocationStatus;
  location_source: PropertyLocationSource | null;
  location_confidence: number | null;
  location_confirmed_at: string | null;
  created_at: string | null;
};

class PropertyRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async list(input: PropertyListQuery & { tenantId: string }) {
    const { page, pageSize, customer_id } = input;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.adminClient
      .from("properties")
      .select("*", { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false });

    if (customer_id) {
      query = query.eq("customer_id", customer_id);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw Errors.dbError("房产列表查询失败", error);
    }

    return {
      list: (data || []) as PropertyRow[],
      total: count || 0,
    };
  }

  async findById(input: { id: string; tenantId: string }) {
    const { data, error } = await this.adminClient
      .from("properties")
      .select("*")
      .eq("id", input.id)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询房产失败", error);
    return data as PropertyRow | null;
  }

  async findCustomerById(input: { customerId: string; tenantId: string }) {
    const { data, error } = await this.adminClient
      .from("customers")
      .select("id")
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) throw Errors.dbError("校验房产客户失败", error);
    return data as { id: string } | null;
  }

  async create(input: {
    tenantId: string;
    payload: CreatePropertyInput;
  }) {
    const { data, error } = await this.adminClient
      .from("properties")
      .insert({
        ...input.payload,
        tenant_id: input.tenantId,
      })
      .select("*")
      .single();

    if (error) throw Errors.dbError("创建房产失败", error);
    return data as PropertyRow;
  }

  async update(input: {
    id: string;
    tenantId: string;
    payload: Omit<UpdatePropertyInput, "id">;
  }) {
    const { data, error } = await this.adminClient
      .from("properties")
      .update(input.payload)
      .eq("id", input.id)
      .eq("tenant_id", input.tenantId)
      .select("*")
      .maybeSingle();

    if (error) throw Errors.dbError("更新房产失败", error);
    return data as PropertyRow | null;
  }
}

export const propertyRepository = new PropertyRepository();
