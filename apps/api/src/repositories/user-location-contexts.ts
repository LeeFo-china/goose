import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type UserLocationContextSource = "gps" | "manual_city" | "manual_address";

export type UserLocationMatchedTenant = {
  tenant_id: string;
  tenant_name: string | null;
  tenant_slug: string | null;
  address?: string | null;
  company_address?: string | null;
  tenant_address?: string | null;
  service_area_id: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  adcode: string | null;
  match_reason: string;
  match_rank?: number;
  distance_km: number | null;
  priority: number;
};

export type UserLocationContextRecord = {
  id: string;
  auth_user_id: string | null;
  visitor_id: string | null;
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
  selection_status: "pending" | "selected" | "skipped" | "expired";
  fallback_reason: string | null;
  confirmed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type CreateUserLocationContextInput = {
  auth_user_id?: string | null;
  visitor_id?: string | null;
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
  selected_tenant_id?: string | null;
  selection_status?: UserLocationContextRecord["selection_status"];
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
        auth_user_id: input.auth_user_id ?? null,
        visitor_id: input.visitor_id ?? null,
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
        selected_tenant_id: input.selected_tenant_id ?? null,
        selection_status: input.selection_status ?? "pending",
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

  async findActiveForVisitor(id: string, visitorId: string) {
    const { data, error } = await this.table()
      .select("*")
      .eq("id", id)
      .eq("visitor_id", visitorId)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 visitor 定位上下文失败", error);
    }

    return (data || null) as UserLocationContextRecord | null;
  }

  async findLatestActiveForVisitor(visitorId: string) {
    const { data, error } = await this.table()
      .select("*")
      .eq("visitor_id", visitorId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 visitor 当前定位上下文失败", error);
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
        selection_status: "selected",
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

  async confirmVisitor(input: {
    id: string;
    visitorId: string;
    selectedTenantId: string | null;
    selectionStatus: "selected" | "skipped";
    confirmedAt: string;
    expiresAt: string;
  }) {
    const now = new Date().toISOString();
    const { data, error } = await this.table()
      .update({
        selected_tenant_id: input.selectedTenantId,
        selection_status: input.selectionStatus,
        confirmed_at: input.confirmedAt,
        expires_at: input.expiresAt,
      })
      .eq("id", input.id)
      .eq("visitor_id", input.visitorId)
      .gt("expires_at", now)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("确认 visitor 定位上下文失败", error);
    }

    return (data || null) as UserLocationContextRecord | null;
  }

  async listForMetrics(since: string, limit = 10000) {
    const { data, error } = await this.table()
      .select(`
        id,
        source,
        province,
        city,
        district,
        adcode,
        latitude,
        longitude,
        accuracy,
        matched_tenants,
        fallback_reason,
        confirmed_at,
        expires_at,
        created_at
      `)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw Errors.dbError("查询定位匹配统计失败", error);
    }

    return (data || []) as UserLocationContextRecord[];
  }

  async countExpiredUnconfirmed(now = new Date().toISOString()) {
    const { count, error } = await this.table()
      .select("id", { count: "exact", head: true })
      .lt("expires_at", now)
      .is("confirmed_at", null);

    if (error) {
      throw Errors.dbError("统计过期定位上下文失败", error);
    }

    return count || 0;
  }

  async deleteExpiredUnconfirmed(now = new Date().toISOString()) {
    const { data, error } = await this.table()
      .delete()
      .lt("expires_at", now)
      .is("confirmed_at", null)
      .select("id");

    if (error) {
      throw Errors.dbError("清理过期定位上下文失败", error);
    }

    return (data || []).length;
  }

}

export const userLocationContextRepository = new UserLocationContextRepository();
