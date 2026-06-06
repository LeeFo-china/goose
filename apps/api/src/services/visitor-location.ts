import { Errors } from "@/errors/error-factory";
import { tenantServiceAreaRepository } from "@/repositories/tenant-service-areas";
import {
  type UserLocationContextRecord,
  type UserLocationMatchedTenant,
  userLocationContextRepository,
} from "@/repositories/user-location-contexts";
import type {
  VisitorLocationBootstrapInput,
  VisitorLocationConfirmInput,
  VisitorLocationSkipInput,
} from "@/schema/visitor-location";
import { locationMatchingService } from "@/services/location-matching";
import { systemSettingsService } from "@/services/system-settings";

type OpenServiceAreaOption = {
  province: string | null;
  city: string;
  district: string | null;
  adcode: string | null;
  tenant_count: number;
};

const PENDING_TTL_MINUTES = 30;
const NO_MATCH_TTL_MINUTES = 10;
const PREFERENCE_TTL_DAYS = 30;

class VisitorLocationService {
  async getOptions(visitorId: string) {
    const [matchEnabled, miniProgramKey, areas, context] = await Promise.all([
      systemSettingsService.getBoolean("LOCATION_MATCH_ENABLED", true),
      systemSettingsService.getString("TENCENT_LBS_MINIPROGRAM_KEY", ""),
      tenantServiceAreaRepository.listActiveForMatching(),
      this.getCurrentContext(visitorId),
    ]);

    return {
      location_match_enabled: matchEnabled,
      tencent_lbs: {
        miniprogram_key: miniProgramKey || null,
        configured: Boolean(miniProgramKey),
      },
      open_service_areas: this.toOpenServiceAreas(areas),
      context: context.context,
      requires_rebootstrap: context.requires_rebootstrap,
      fallback: {
        manual_city_enabled: true,
      },
    };
  }

  async getContext(visitorId: string) {
    return this.getCurrentContext(visitorId);
  }

  async bootstrap(input: VisitorLocationBootstrapInput, visitorId: string) {
    const [matchEnabled, shouldStoreRawCoordinate] = await Promise.all([
      systemSettingsService.getBoolean("LOCATION_MATCH_ENABLED", true),
      systemSettingsService.getBoolean("LOCATION_STORE_RAW_COORDINATE", false),
    ]);
    const matchedTenants = matchEnabled
      ? await locationMatchingService.matchServiceAreas(input)
      : [];
    const normalizedTenants = matchedTenants.map((item) => this.toContextTenant(item));
    const recommendedTenant = normalizedTenants[0] ?? null;
    const selectionStatus = this.getInitialSelectionStatus(matchEnabled, normalizedTenants.length);
    const expiresAt = this.getInitialExpiresAt(selectionStatus);
    const context = await userLocationContextRepository.create({
      visitor_id: visitorId,
      source: input.source,
      province: input.province ?? null,
      city: input.city ?? null,
      district: input.district ?? null,
      adcode: input.adcode ?? null,
      latitude: shouldStoreRawCoordinate ? input.latitude ?? null : null,
      longitude: shouldStoreRawCoordinate ? input.longitude ?? null : null,
      accuracy: shouldStoreRawCoordinate ? input.accuracy ?? null : null,
      matched_tenants: normalizedTenants,
      recommended_tenant_id: recommendedTenant?.tenant_id ?? null,
      selected_tenant_id: selectionStatus === "selected" ? recommendedTenant?.tenant_id ?? null : null,
      selection_status: selectionStatus,
      fallback_reason: this.getFallbackReason(matchEnabled, normalizedTenants.length),
      expires_at: expiresAt,
    });

    return {
      context_id: context.id,
      location_match_enabled: matchEnabled,
      location: {
        source: input.source,
        province: input.province ?? null,
        city: input.city ?? null,
        district: input.district ?? null,
        adcode: input.adcode ?? null,
      },
      matched_tenants: normalizedTenants,
      recommended_tenant_id: recommendedTenant?.tenant_id ?? null,
      requires_user_confirmation: normalizedTenants.length > 1,
      selection_status: selectionStatus,
      fallback_reason: context.fallback_reason,
      expires_at: context.expires_at,
    };
  }

  async confirm(input: VisitorLocationConfirmInput, visitorId: string) {
    const context = await userLocationContextRepository.findActiveForVisitor(
      input.context_id,
      visitorId,
    );
    if (!context) {
      throw Errors.notFound("visitor 定位上下文不存在或已过期");
    }

    const selectedTenant = context.matched_tenants.find((item) => item.tenant_id === input.tenant_id);
    if (!selectedTenant) {
      throw Errors.badRequest("请选择本次定位匹配返回的装修公司");
    }
    const isValid = await this.isTenantCandidateStillValid(selectedTenant);
    if (!isValid) {
      throw Errors.badRequest("装修公司服务区域已失效，请重新定位");
    }

    const confirmed = await userLocationContextRepository.confirmVisitor({
      id: context.id,
      visitorId,
      selectedTenantId: input.tenant_id,
      selectionStatus: "selected",
      confirmedAt: new Date().toISOString(),
      expiresAt: this.getPreferenceExpiresAt(),
    });
    if (!confirmed) {
      throw Errors.notFound("visitor 定位上下文不存在或已过期");
    }

    return {
      context_id: confirmed.id,
      selected_tenant_id: confirmed.selected_tenant_id,
      selected_tenant: selectedTenant,
      selection_status: confirmed.selection_status,
      confirmed_at: confirmed.confirmed_at,
      expires_at: confirmed.expires_at,
    };
  }

  async skip(input: VisitorLocationSkipInput, visitorId: string) {
    const context = await userLocationContextRepository.findActiveForVisitor(
      input.context_id,
      visitorId,
    );
    if (!context) {
      throw Errors.notFound("visitor 定位上下文不存在或已过期");
    }

    const confirmed = await userLocationContextRepository.confirmVisitor({
      id: context.id,
      visitorId,
      selectedTenantId: null,
      selectionStatus: "skipped",
      confirmedAt: new Date().toISOString(),
      expiresAt: this.getPreferenceExpiresAt(),
    });
    if (!confirmed) {
      throw Errors.notFound("visitor 定位上下文不存在或已过期");
    }

    return {
      context_id: confirmed.id,
      selected_tenant_id: null,
      selected_tenant: null,
      selection_status: confirmed.selection_status,
      confirmed_at: confirmed.confirmed_at,
      expires_at: confirmed.expires_at,
    };
  }

  private async getCurrentContext(visitorId: string) {
    const context = await userLocationContextRepository.findLatestActiveForVisitor(visitorId);
    if (!context) {
      return { context: null, requires_rebootstrap: false };
    }

    if (context.selected_tenant_id) {
      const selectedTenant = context.matched_tenants.find((item) => item.tenant_id === context.selected_tenant_id);
      const isValid = selectedTenant
        ? await this.isTenantCandidateStillValid(selectedTenant)
        : false;
      if (!isValid) {
        return { context: null, requires_rebootstrap: true };
      }
    }

    return {
      context: this.serializeContext(context),
      requires_rebootstrap: false,
    };
  }

  private serializeContext(context: UserLocationContextRecord) {
    const selectedTenant = context.selected_tenant_id
      ? context.matched_tenants.find((item) => item.tenant_id === context.selected_tenant_id) ?? null
      : null;

    return {
      context_id: context.id,
      province: context.province,
      city: context.city,
      district: context.district,
      adcode: context.adcode,
      selected_tenant_id: context.selected_tenant_id,
      selected_tenant: selectedTenant,
      selection_status: context.selection_status,
      fallback_reason: context.fallback_reason,
      confirmed_at: context.confirmed_at,
      expires_at: context.expires_at,
    };
  }

  private getInitialSelectionStatus(
    matchEnabled: boolean,
    matchedTenantCount: number,
  ): UserLocationContextRecord["selection_status"] {
    if (!matchEnabled || matchedTenantCount === 0) return "skipped";
    if (matchedTenantCount === 1) return "selected";
    return "pending";
  }

  private getFallbackReason(matchEnabled: boolean, matchedTenantCount: number) {
    if (!matchEnabled) return "LOCATION_MATCH_DISABLED";
    return matchedTenantCount ? null : "NO_SERVICE_AREA_MATCHED";
  }

  private getInitialExpiresAt(selectionStatus: UserLocationContextRecord["selection_status"]) {
    if (selectionStatus === "pending") {
      return new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000).toISOString();
    }
    if (selectionStatus === "skipped") {
      return new Date(Date.now() + NO_MATCH_TTL_MINUTES * 60 * 1000).toISOString();
    }
    return this.getPreferenceExpiresAt();
  }

  private getPreferenceExpiresAt() {
    return new Date(Date.now() + PREFERENCE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }

  private async isTenantCandidateStillValid(candidate: UserLocationMatchedTenant) {
    if (!candidate.service_area_id) return false;
    const area = await tenantServiceAreaRepository.findById(candidate.service_area_id);
    return Boolean(
      area &&
        area.status === "active" &&
        area.tenant?.status === "active" &&
        area.tenant_id === candidate.tenant_id,
    );
  }

  private toOpenServiceAreas(areas: Awaited<ReturnType<typeof tenantServiceAreaRepository.listActiveForMatching>>) {
    const byArea = new Map<string, OpenServiceAreaOption>();
    for (const area of areas) {
      const key = [area.province || "", area.city, area.district || "", area.adcode || ""].join("|");
      const existing = byArea.get(key);
      if (existing) {
        existing.tenant_count += 1;
        continue;
      }
      byArea.set(key, {
        province: area.province,
        city: area.city,
        district: area.district,
        adcode: area.adcode,
        tenant_count: 1,
      });
    }

    return [...byArea.values()].sort((left, right) => {
      if (right.tenant_count !== left.tenant_count) return right.tenant_count - left.tenant_count;
      return [left.province, left.city, left.district].filter(Boolean).join("")
        .localeCompare([right.province, right.city, right.district].filter(Boolean).join(""), "zh-CN");
    });
  }

  private toContextTenant(input: UserLocationMatchedTenant): UserLocationMatchedTenant {
    return {
      tenant_id: input.tenant_id,
      tenant_name: input.tenant_name,
      tenant_slug: input.tenant_slug,
      address: input.address ?? null,
      company_address: input.company_address ?? input.address ?? null,
      tenant_address: input.tenant_address ?? input.address ?? null,
      latitude: input.latitude ?? input.address_latitude ?? null,
      longitude: input.longitude ?? input.address_longitude ?? null,
      lat: input.lat ?? input.latitude ?? input.address_latitude ?? null,
      lng: input.lng ?? input.longitude ?? input.address_longitude ?? null,
      address_latitude: input.address_latitude ?? input.latitude ?? null,
      address_longitude: input.address_longitude ?? input.longitude ?? null,
      service_area_id: input.service_area_id,
      province: input.province,
      city: input.city,
      district: input.district,
      adcode: input.adcode,
      match_reason: input.match_reason,
      match_rank: input.match_rank,
      distance_km: input.distance_km,
      priority: input.priority,
    };
  }
}

export const visitorLocationService = new VisitorLocationService();
