import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type UserLocationContextSource = "gps" | "manual_city" | "manual_address";

export type UserLocationMatchedTenant = {
  tenant_id: string;
  tenant_name: string | null;
  tenant_slug: string | null;
  service_area_id: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  adcode: string | null;
  match_reason: string;
  distance_km: number | null;
  priority: number;
};

export type UserLocationContextRecord = {
  id: string;
  auth_user_id: string;
  source: UserLocationContextSource;
  province: string | null;
  city: string | null;
  district: string | null;
  adcode: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  matched_tenants: UserLocationMatchedTenant[];
  recommended_tenant_id: string | null;
  selected_tenant_id: string | null;
  fallback_reason: string | null;
  confirmed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type CreateUserLocationContextInput = {
  auth_user_id: string;
  source: UserLocationContextSource;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  adcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  matched_tenants: UserLocationMatchedTenant[];
  recommended_tenant_id?: string | null;
  fallback_reason?: string | null;
  expires_at: string;
};

class UserLocationContextRepository {
  private client = SupabaseDB.getAdminClient();

  private table() {
    return (this.client as unknown as { from: (table: string) => any }).from("user_location_contexts");
  }

  async create(input: CreateUserLocationContextInput) {
    const { data, error } = await this.table()
      .insert({
        auth_user_id: input.auth_user_id,
        source: input.source,
        province: input.province ?? null,
        city: input.city ?? null,
        district: input.district ?? null,
        adcode: input.adcode ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracy: input.accuracy ?? null,
        matched_tenants: input.matched_tenants,
        recommended_tenant_id: input.recommended_tenant_id ?? null,
        fallback_reason: input.fallback_reason ?? null,
        expires_at: input.expires_at,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建定位上下文失败", error);
    }

    return data as UserLocationContextRecord;
  }

  async findActiveForUser(id: string, authUserId: string) {
    const { data, error } = await this.table()
      .select("*")
      .eq("id", id)
      .eq("auth_user_id", authUserId)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询定位上下文失败", error);
    }

    return (data || null) as UserLocationContextRecord | null;
  }

  async confirm(input: {
    id: string;
    authUserId: string;
    selectedTenantId: string;
    confirmedAt: string;
  }) {
    const now = new Date().toISOString();
    const { data, error } = await this.table()
      .update({
        selected_tenant_id: input.selectedTenantId,
        confirmed_at: input.confirmedAt,
      })
      .eq("id", input.id)
      .eq("auth_user_id", input.authUserId)
      .gt("expires_at", now)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("确认定位租户失败", error);
    }

    return (data || null) as UserLocationContextRecord | null;
  }
}

export const userLocationContextRepository = new UserLocationContextRepository();
