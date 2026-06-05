import { Errors } from "@/errors/error-factory";
import { tenantServiceAreaRepository } from "@/repositories/tenant-service-areas";
import {
  type UserLocationMatchedTenant,
  userLocationContextRepository,
} from "@/repositories/user-location-contexts";
import type {
  LocationBootstrapConfirmInput,
  LocationBootstrapInput,
} from "@/schema/tenant-service-areas";
import { locationMatchingService } from "@/services/location-matching";
import { systemSettingsService } from "@/services/system-settings";

type OpenServiceAreaOption = {
  province: string | null;
  city: string;
  district: string | null;
  adcode: string | null;
  tenant_count: number;
};

const DEFAULT_LOCATION_CONTEXT_TTL_HOURS = 24;
const MAX_LOCATION_CONTEXT_TTL_HOURS = 24 * 7;

class CustomerLocationService {
  async getOptions() {
    const [matchEnabled, miniProgramKey, areas] = await Promise.all([
      systemSettingsService.getBoolean("LOCATION_MATCH_ENABLED", true),
      systemSettingsService.getString("TENCENT_LBS_MINIPROGRAM_KEY", ""),
      tenantServiceAreaRepository.listActiveForMatching(),
    ]);
    const openAreas = this.toOpenServiceAreas(areas);

    return {
      location_match_enabled: matchEnabled,
      tencent_lbs: {
        miniprogram_key: miniProgramKey || null,
        configured: Boolean(miniProgramKey),
      },
      open_service_areas: openAreas,
      default_location: openAreas[0] || null,
      fallback: {
        manual_city_enabled: true,
      },
    };
  }

  async bootstrap(input: LocationBootstrapInput, authUserId: string) {
    const [matchEnabled, ttlHours, shouldStoreRawCoordinate] = await Promise.all([
      systemSettingsService.getBoolean("LOCATION_MATCH_ENABLED", true),
      systemSettingsService.getNumber("LOCATION_CONTEXT_TTL_HOURS", DEFAULT_LOCATION_CONTEXT_TTL_HOURS),
      systemSettingsService.getBoolean("LOCATION_STORE_RAW_COORDINATE", false),
    ]);
    const result = matchEnabled
      ? await locationMatchingService.bootstrapLocation(input, authUserId)
      : this.buildDisabledResult(input);
    const expiresAt = this.getExpiresAt(ttlHours);
    const context = await userLocationContextRepository.create({
      auth_user_id: authUserId,
      source: result.location.source,
      province: result.location.province,
      city: result.location.city,
      district: result.location.district,
      adcode: result.location.adcode,
      latitude: shouldStoreRawCoordinate ? result.location.latitude : null,
      longitude: shouldStoreRawCoordinate ? result.location.longitude : null,
      accuracy: shouldStoreRawCoordinate ? result.location.accuracy : null,
      matched_tenants: result.matched_tenants.map((item) => this.toContextTenant(item)),
      recommended_tenant_id: result.recommended_tenant_id,
      fallback_reason: result.fallback_reason,
      expires_at: expiresAt,
    });

    return {
      ...result,
      context_id: context.id,
      expires_at: context.expires_at,
      location_match_enabled: matchEnabled,
    };
  }

  async confirm(input: LocationBootstrapConfirmInput, authUserId: string) {
    const context = await userLocationContextRepository.findActiveForUser(
      input.context_id,
      authUserId,
    );
    if (!context) {
      throw Errors.notFound("定位上下文不存在或已过期");
    }

    const selectedTenant = context.matched_tenants.find((item) => item.tenant_id === input.tenant_id);
    if (!selectedTenant) {
      throw Errors.badRequest("请选择本次定位匹配返回的装修公司");
    }

    const confirmed = await userLocationContextRepository.confirm({
      id: context.id,
      authUserId,
      selectedTenantId: input.tenant_id,
      confirmedAt: new Date().toISOString(),
    });
    if (!confirmed) {
      throw Errors.notFound("定位上下文不存在或已过期");
    }

    return {
      context_id: confirmed.id,
      selected_tenant_id: confirmed.selected_tenant_id,
      selected_tenant: selectedTenant,
      confirmed_at: confirmed.confirmed_at,
      expires_at: confirmed.expires_at,
    };
  }

  private toOpenServiceAreas(areas: Awaited<ReturnType<typeof tenantServiceAreaRepository.listActiveForMatching>>) {
    const byArea = new Map<string, OpenServiceAreaOption>();
    for (const area of areas) {
      const key = [
        area.province || "",
        area.city,
        area.district || "",
        area.adcode || "",
      ].join("|");
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

  private buildDisabledResult(input: LocationBootstrapInput) {
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
        match_kind: null,
        bound_tenant_id: null,
        reference_id: null,
      },
      matched_tenants: [],
      recommended_tenant_id: null,
      requires_user_confirmation: false,
      fallback_reason: "LOCATION_MATCH_DISABLED",
    };
  }

  private getExpiresAt(ttlHours: number) {
    const normalizedTtl = Math.min(
      Math.max(Math.trunc(ttlHours) || DEFAULT_LOCATION_CONTEXT_TTL_HOURS, 1),
      MAX_LOCATION_CONTEXT_TTL_HOURS,
    );
    return new Date(Date.now() + normalizedTtl * 60 * 60 * 1000).toISOString();
  }

  private toContextTenant(input: UserLocationMatchedTenant): UserLocationMatchedTenant {
    return {
      tenant_id: input.tenant_id,
      tenant_name: input.tenant_name,
      tenant_slug: input.tenant_slug,
      service_area_id: input.service_area_id,
      province: input.province,
      city: input.city,
      district: input.district,
      adcode: input.adcode,
      match_reason: input.match_reason,
      distance_km: input.distance_km,
      priority: input.priority,
    };
  }
}

export const customerLocationService = new CustomerLocationService();
