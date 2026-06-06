import { Errors } from "@/errors/error-factory";
import { tenantServiceAreaRepository, type TenantServiceAreaRecord } from "@/repositories/tenant-service-areas";
import type {
  CreateTenantServiceAreaInput,
  LocationBootstrapInput,
  TenantServiceAreaListQuery,
  UpdateTenantServiceAreaInput,
} from "@/schema/tenant-service-areas";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { SupabaseDB } from "@/utils/supabase";

type TenantLite = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  address: string | null;
};

type IdentityMatch = {
  kind: "employee" | "customer_project" | "customer_profile";
  tenant: TenantLite;
  reference_id: string | null;
};

type LocationMatchReason = "identity" | "adcode" | "district" | "city" | "province" | "distance";

type TenantLocationCandidate = {
  tenant_id: string;
  tenant_name: string | null;
  tenant_slug: string | null;
  address: string | null;
  company_address: string | null;
  tenant_address: string | null;
  service_area_id: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  adcode: string | null;
  match_reason: LocationMatchReason;
  match_rank: number;
  distance_km: number | null;
  priority: number;
};

const EARTH_RADIUS_KM = 6371;
const MATCH_REASON_RANK: Record<LocationMatchReason, number> = {
  identity: 100,
  adcode: 90,
  district: 80,
  city: 70,
  province: 60,
  distance: 50,
};

class LocationMatchingService {
  async listServiceAreas(query: TenantServiceAreaListQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    return tenantServiceAreaRepository.list(query);
  }

  async createServiceArea(input: CreateTenantServiceAreaInput, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const record = await tenantServiceAreaRepository.create(input);
    await platformAuditLogService.recordBestEffort({
      action: "tenant_service_area_create",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: record.tenant_id,
      resourceType: "tenant_service_area",
      resourceId: record.id,
      resourceLabel: this.formatAreaLabel(record),
      summary: `创建服务区域「${this.formatAreaLabel(record)}」`,
      metadata: { input },
    });
    return record;
  }

  async updateServiceArea(id: string, input: UpdateTenantServiceAreaInput, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const existing = await tenantServiceAreaRepository.findById(id);
    if (!existing) throw Errors.notFound("服务区域不存在");

    const record = await tenantServiceAreaRepository.update(id, input);
    if (!record) throw Errors.notFound("服务区域不存在");

    await platformAuditLogService.recordBestEffort({
      action: "tenant_service_area_update",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: record.tenant_id,
      resourceType: "tenant_service_area",
      resourceId: record.id,
      resourceLabel: this.formatAreaLabel(record),
      summary: `更新服务区域「${this.formatAreaLabel(record)}」`,
      metadata: { previous: existing, input },
    });
    return record;
  }

  async bootstrapLocation(input: LocationBootstrapInput, authUserId: string) {
    const [identityMatch, areaCandidates] = await Promise.all([
      this.resolveIdentityMatch(authUserId),
      this.matchServiceAreas(input),
    ]);
    const identityCandidate = identityMatch
      ? this.identityToCandidate(identityMatch)
      : null;
    const matchedTenants = identityCandidate
      ? [identityCandidate, ...areaCandidates.filter((item) => item.tenant_id !== identityCandidate.tenant_id)]
      : areaCandidates;
    const recommendedTenant = matchedTenants[0] ?? null;

    return {
      location: {
        source: input.source,
        province: input.province ?? null,
        city: input.city ?? null,
        district: input.district ?? null,
        adcode: input.adcode ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracy: input.accuracy ?? null,
      },
      identity: {
        match_kind: identityMatch?.kind ?? null,
        bound_tenant_id: identityMatch?.tenant.id ?? null,
        reference_id: identityMatch?.reference_id ?? null,
      },
      matched_tenants: matchedTenants,
      recommended_tenant_id: recommendedTenant?.tenant_id ?? null,
      requires_user_confirmation: !identityCandidate && matchedTenants.length > 1,
      fallback_reason: matchedTenants.length ? null : "NO_SERVICE_AREA_MATCHED",
    };
  }

  async matchServiceAreas(input: LocationBootstrapInput): Promise<TenantLocationCandidate[]> {
    const areas = await tenantServiceAreaRepository.listActiveForMatching();
    const candidates = areas
      .map((area) => this.matchArea(area, input))
      .filter((item): item is TenantLocationCandidate => Boolean(item))
      .sort((left, right) => this.compareCandidates(left, right));

    const byTenant = new Map<string, TenantLocationCandidate>();
    for (const candidate of candidates) {
      if (!byTenant.has(candidate.tenant_id)) {
        byTenant.set(candidate.tenant_id, candidate);
      }
    }
    return [...byTenant.values()];
  }

  private matchArea(area: TenantServiceAreaRecord, input: LocationBootstrapInput): TenantLocationCandidate | null {
    if (!area.tenant || area.tenant.status !== "active") return null;

    const distanceKm = this.calculateDistanceKm(input, area);
    if (
      distanceKm != null &&
      area.service_radius_km != null &&
      distanceKm > Number(area.service_radius_km)
    ) {
      return null;
    }

    const reason = this.resolveAreaMatchReason(area, input, distanceKm);
    if (!reason) return null;

    return {
      tenant_id: area.tenant_id,
      tenant_name: area.tenant.name,
      tenant_slug: area.tenant.slug,
      address: this.normalizeAddress(area.tenant.address),
      company_address: this.normalizeAddress(area.tenant.address),
      tenant_address: this.normalizeAddress(area.tenant.address),
      service_area_id: area.id,
      province: area.province,
      city: area.city,
      district: area.district,
      adcode: area.adcode,
      match_reason: reason,
      match_rank: MATCH_REASON_RANK[reason],
      distance_km: distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
      priority: area.priority,
    };
  }

  private compareCandidates(left: TenantLocationCandidate, right: TenantLocationCandidate) {
    if (right.match_rank !== left.match_rank) return right.match_rank - left.match_rank;
    if (right.priority !== left.priority) return right.priority - left.priority;
    if (left.distance_km != null && right.distance_km != null) {
      return left.distance_km - right.distance_km;
    }
    if (left.distance_km != null) return -1;
    if (right.distance_km != null) return 1;
    return (left.tenant_name || "").localeCompare(right.tenant_name || "", "zh-CN");
  }

  private resolveAreaMatchReason(
    area: TenantServiceAreaRecord,
    input: LocationBootstrapInput,
    distanceKm: number | null,
  ): LocationMatchReason | null {
    if (input.adcode && area.adcode && input.adcode === area.adcode) return "adcode";
    if (input.city && area.city === input.city && input.district && area.district === input.district) return "district";
    if (input.city && area.city === input.city) return "city";
    if (!input.city && input.province && area.province === input.province) return "province";
    if (!input.city && distanceKm != null) return "distance";
    if (input.city && area.city === input.city && distanceKm != null) return "distance";
    return null;
  }

  private calculateDistanceKm(input: LocationBootstrapInput, area: TenantServiceAreaRecord) {
    if (
      input.latitude == null ||
      input.longitude == null ||
      area.center_latitude == null ||
      area.center_longitude == null
    ) {
      return null;
    }

    const lat1 = this.toRadians(input.latitude);
    const lat2 = this.toRadians(area.center_latitude);
    const deltaLat = this.toRadians(area.center_latitude - input.latitude);
    const deltaLng = this.toRadians(area.center_longitude - input.longitude);
    const a = Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRadians(value: number) {
    return value * Math.PI / 180;
  }

  private async resolveIdentityMatch(authUserId: string): Promise<IdentityMatch | null> {
    const [employeeMatch, customerMatch] = await Promise.all([
      this.findEmployeeTenant(authUserId),
      this.findCustomerTenant(authUserId),
    ]);
    return employeeMatch ?? customerMatch;
  }

  private async findEmployeeTenant(authUserId: string): Promise<IdentityMatch | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select("id, tenant_id, status, tenant:tenants!employees_tenant_id_fkey(id,name,slug,status,address)")
      .eq("user_id", authUserId)
      .eq("status", "active")
      .not("tenant_id", "is", null)
      .limit(2);

    if (error) throw Errors.dbError("查询员工租户身份失败", error);

    const row = (data || []).find((item: any) => item.tenant?.status === "active") as any;
    return row?.tenant
      ? { kind: "employee", tenant: row.tenant, reference_id: row.id }
      : null;
  }

  private async findCustomerTenant(authUserId: string): Promise<IdentityMatch | null> {
    const { data: customers, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, tenant_id, status, tenant:tenants!customers_tenant_id_fkey(id,name,slug,status,address)")
      .eq("user_id", authUserId)
      .not("tenant_id", "is", null)
      .limit(20);

    if (error) throw Errors.dbError("查询客户租户身份失败", error);

    const customerRows = (customers || []) as any[];
    if (!customerRows.length) return null;

    const customerIds = customerRows.map((item) => item.id).filter(Boolean);
    const { data: projects, error: projectError } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, tenant_id, status, customer_id, tenant:tenants!projects_tenant_id_fkey(id,name,slug,status,address)")
      .in("customer_id", customerIds)
      .neq("status", "invalid")
      .limit(20);

    if (projectError) throw Errors.dbError("查询客户项目租户失败", projectError);

    const project = ((projects || []) as any[]).find((item) => item.tenant?.status === "active");
    if (project?.tenant) {
      return { kind: "customer_project", tenant: project.tenant, reference_id: project.id };
    }

    const customer = customerRows.find((item) => item.tenant?.status === "active");
    return customer?.tenant
      ? { kind: "customer_profile", tenant: customer.tenant, reference_id: customer.id }
      : null;
  }

  private identityToCandidate(match: IdentityMatch): TenantLocationCandidate {
    return {
      tenant_id: match.tenant.id,
      tenant_name: match.tenant.name,
      tenant_slug: match.tenant.slug,
      address: this.normalizeAddress(match.tenant.address),
      company_address: this.normalizeAddress(match.tenant.address),
      tenant_address: this.normalizeAddress(match.tenant.address),
      service_area_id: null,
      province: null,
      city: null,
      district: null,
      adcode: null,
      match_reason: "identity",
      match_rank: MATCH_REASON_RANK.identity,
      distance_km: null,
      priority: 10000,
    };
  }

  private formatAreaLabel(area: TenantServiceAreaRecord) {
    return [area.city, area.district].filter(Boolean).join(" ") || area.adcode || area.id;
  }

  private normalizeAddress(address: string | null | undefined) {
    const value = address?.trim();
    return value || null;
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }
}

export const locationMatchingService = new LocationMatchingService();
