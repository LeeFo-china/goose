import { Errors } from "@/errors/error-factory";
import type {
  CreateTenantServiceAreaInput,
  TenantServiceAreaListQuery,
  TenantServiceAreaStatus,
  UpdateTenantServiceAreaInput,
} from "@/schema/tenant-service-areas";
import { SupabaseDB } from "@/utils/supabase";

export type TenantServiceAreaRecord = {
  id: string;
  tenant_id: string;
  province: string | null;
  city: string;
  district: string | null;
  adcode: string | null;
  center_latitude: number | null;
  center_longitude: number | null;
  service_radius_km: number | null;
  priority: number;
  status: TenantServiceAreaStatus;
  created_at: string;
  updated_at: string;
  tenant?: {
    id: string;
    name: string | null;
    slug: string | null;
    status: string | null;
  } | null;
};

class TenantServiceAreaRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  async list(query: TenantServiceAreaListQuery) {
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let request = this.from("tenant_service_areas")
      .select(`
        *,
        tenant:tenants!tenant_service_areas_tenant_id_fkey(id,name,slug,status)
      `, { count: "exact" });

    if (query.tenant_id) request = request.eq("tenant_id", query.tenant_id);
    if (query.status) request = request.eq("status", query.status);
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      request = request.or(`province.ilike.${keyword},city.ilike.${keyword},district.ilike.${keyword},adcode.ilike.${keyword}`);
    }

    const { data, error, count } = await request
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询租户服务区域失败", error);
    }

    const total = count ?? 0;
    return {
      list: (data || []) as TenantServiceAreaRecord[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
  }

  async listActiveForMatching() {
    const { data, error } = await this.from("tenant_service_areas")
      .select(`
        *,
        tenant:tenants!tenant_service_areas_tenant_id_fkey(id,name,slug,status)
      `)
      .eq("status", "active")
      .order("priority", { ascending: false });

    if (error) {
      throw Errors.dbError("查询可匹配服务区域失败", error);
    }

    return ((data || []) as TenantServiceAreaRecord[])
      .filter((area) => area.tenant?.status === "active");
  }

  async findById(id: string) {
    const { data, error } = await this.from("tenant_service_areas")
      .select(`
        *,
        tenant:tenants!tenant_service_areas_tenant_id_fkey(id,name,slug,status)
      `)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户服务区域失败", error);
    }

    return (data || null) as TenantServiceAreaRecord | null;
  }

  async create(input: CreateTenantServiceAreaInput) {
    const { data, error } = await this.from("tenant_service_areas")
      .insert(input)
      .select(`
        *,
        tenant:tenants!tenant_service_areas_tenant_id_fkey(id,name,slug,status)
      `)
      .single();

    if (error) {
      throw Errors.dbError("创建租户服务区域失败", error);
    }

    return data as TenantServiceAreaRecord;
  }

  async update(id: string, input: UpdateTenantServiceAreaInput) {
    const { data, error } = await this.from("tenant_service_areas")
      .update(input)
      .eq("id", id)
      .select(`
        *,
        tenant:tenants!tenant_service_areas_tenant_id_fkey(id,name,slug,status)
      `)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新租户服务区域失败", error);
    }

    return (data || null) as TenantServiceAreaRecord | null;
  }
}

export const tenantServiceAreaRepository = new TenantServiceAreaRepository();
