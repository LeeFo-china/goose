import { randomUUID } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import type {
  CreateCustomerPropertyInput,
  UpdateCustomerPropertyInput,
} from "@/schema/properties";
import { SupabaseDB } from "@/utils/supabase";
import type { PropertyLocationStatus } from "@gooes/domain";

export const CUSTOMER_PROPERTY_SUMMARY_SELECT = `
  id,
  community,
  building_info,
  layout,
  area,
  latitude,
  longitude,
  province,
  city,
  district,
  adcode,
  location_status,
  created_at
`;

export type CustomerPropertyAccessCustomer = {
  id: string;
  owner_id: string | null;
  property_id: string | null;
  tenant_id: string | null;
};

export type CustomerPrimaryPropertySummary = {
  id: string;
  community: string;
  building_info: string | null;
  layout: string | null;
  area: number | null;
  latitude: number | null;
  longitude: number | null;
  province: string | null;
  city: string | null;
  district: string | null;
  adcode: string | null;
  location_status: PropertyLocationStatus;
  created_at: string | null;
};

export type CustomerPropertySummary = CustomerPrimaryPropertySummary & {
  customer_id: string | null;
};

export type NormalizedCustomerPropertyPayload = {
  community: string;
  building_info: string | null;
  area: number | null;
  layout: string | null;
};

class CustomerPropertyRepository {
  async findCustomerAccess(input: { customerId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id, property_id, tenant_id")
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户失败", error);
    }

    return (data as CustomerPropertyAccessCustomer | null) ?? null;
  }

  async getPrimarySummary(input: { customerId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .select(CUSTOMER_PROPERTY_SUMMARY_SELECT)
      .eq("customer_id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户主房产失败", error);
    }

    return ((data as unknown) as CustomerPrimaryPropertySummary | null) ?? null;
  }

  async listSummariesByCustomer(input: { customerId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .select(CUSTOMER_PROPERTY_SUMMARY_SELECT)
      .eq("customer_id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询客户房产摘要失败", error);
    }

    return (data || []) as CustomerPrimaryPropertySummary[];
  }

  async listSummariesByCustomerIds(input: {
    customerIds: string[];
    tenantId: string;
  }) {
    if (input.customerIds.length === 0) {
      return [] as CustomerPropertySummary[];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .select(`${CUSTOMER_PROPERTY_SUMMARY_SELECT}, customer_id`)
      .in("customer_id", input.customerIds)
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询客户房产摘要失败", error);
    }

    return (data || []) as CustomerPropertySummary[];
  }

  async findCustomerProperty(input: {
    customerId: string;
    propertyId: string;
    tenantId: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .select(`${CUSTOMER_PROPERTY_SUMMARY_SELECT}, customer_id`)
      .eq("id", input.propertyId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询房产失败", error);
    }

    return ((data as unknown) as CustomerPropertySummary | null) ?? null;
  }

  async createProperty(input: {
    customerId: string;
    tenantId: string;
    payload: CreateCustomerPropertyInput;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .insert({
        id: randomUUID(),
        customer_id: input.customerId,
        tenant_id: input.tenantId,
        community: input.payload.community,
        building_info: input.payload.building_info ?? null,
        area: input.payload.area ?? null,
        layout: input.payload.layout ?? null,
        latitude: input.payload.latitude ?? null,
        longitude: input.payload.longitude ?? null,
        province: input.payload.province ?? null,
        city: input.payload.city ?? null,
        district: input.payload.district ?? null,
        adcode: input.payload.adcode ?? null,
      })
      .select(CUSTOMER_PROPERTY_SUMMARY_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("创建客户房产失败", error);
    }

    return data as unknown as CustomerPrimaryPropertySummary;
  }

  async updateProperty(input: {
    propertyId: string;
    tenantId: string;
    payload: UpdateCustomerPropertyInput | NormalizedCustomerPropertyPayload;
  }) {
    const payload = input.payload;
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .update({
        ...(payload.community !== undefined ? { community: payload.community } : {}),
        ...(payload.building_info !== undefined
          ? { building_info: payload.building_info ?? null }
          : {}),
        ...(payload.area !== undefined ? { area: payload.area ?? null } : {}),
        ...(payload.layout !== undefined ? { layout: payload.layout ?? null } : {}),
        ...("latitude" in payload && payload.latitude !== undefined
          ? { latitude: payload.latitude ?? null }
          : {}),
        ...("longitude" in payload && payload.longitude !== undefined
          ? { longitude: payload.longitude ?? null }
          : {}),
        ...("province" in payload && payload.province !== undefined
          ? { province: payload.province ?? null }
          : {}),
        ...("city" in payload && payload.city !== undefined
          ? { city: payload.city ?? null }
          : {}),
        ...("district" in payload && payload.district !== undefined
          ? { district: payload.district ?? null }
          : {}),
        ...("adcode" in payload && payload.adcode !== undefined
          ? { adcode: payload.adcode ?? null }
          : {}),
      })
      .eq("id", input.propertyId)
      .eq("tenant_id", input.tenantId)
      .select(CUSTOMER_PROPERTY_SUMMARY_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("更新客户房产失败", error);
    }

    return data as unknown as CustomerPrimaryPropertySummary;
  }

  async createPrimaryCandidate(input: {
    customerId: string;
    tenantId: string;
    payload: NormalizedCustomerPropertyPayload;
  }) {
    const { error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .insert({
        id: randomUUID(),
        customer_id: input.customerId,
        tenant_id: input.tenantId,
        ...input.payload,
      })
      .select("id");

    if (error) {
      throw Errors.dbError("创建客户主房产失败", error);
    }
  }

  async setPrimaryProperty(input: {
    customerId: string;
    propertyId: string;
    tenantId: string;
  }) {
    const { error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .update({ property_id: input.propertyId })
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .select("id");

    if (error) {
      throw Errors.dbError("设置主房产失败", error);
    }
  }
}

export const customerPropertyRepository = new CustomerPropertyRepository();
