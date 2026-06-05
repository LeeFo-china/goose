import type {
  PropertyLocationSource,
  PropertyLocationStatus,
} from "@gooes/domain";

import { tenantServiceAreaRepository } from "@/repositories/tenant-service-areas";
import { tencentLbsService } from "@/services/tencent-lbs";

type PropertyLocationFields = {
  community?: string | null;
  building_info?: string | null;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  adcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_status?: PropertyLocationStatus;
  location_source?: PropertyLocationSource | null;
  location_confidence?: number | null;
  location_confirmed_at?: string | null;
};

type ExistingPropertyLocation = {
  community: string;
  building_info: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  adcode: string | null;
  latitude: number | null;
  longitude: number | null;
  location_status?: PropertyLocationStatus | null;
};

const LOCATION_ADDRESS_FIELDS = [
  "community",
  "building_info",
  "province",
  "city",
  "district",
  "adcode",
  "latitude",
  "longitude",
] as const;

class PropertyLocationService {
  async enrichPayload<TPayload extends PropertyLocationFields>(input: {
    tenantId: string;
    payload: TPayload;
    existing?: ExistingPropertyLocation | null;
  }): Promise<TPayload> {
    const payload = input.payload;
    const existing = input.existing ?? null;

    if (this.isConfirmed(existing) && payload.location_status !== "confirmed") {
      return payload;
    }

    const base = this.mergeBase(payload, existing);
    if (!base.community?.trim()) {
      return this.withDerivedStatus(payload, base);
    }

    if (!this.shouldGeocode(payload, existing)) {
      return this.withDerivedStatus(payload, base);
    }

    const defaultArea = await this.getDefaultTenantArea(input.tenantId);
    const province = base.province ?? defaultArea?.province ?? null;
    const city = base.city ?? defaultArea?.city ?? null;
    const district = base.district ?? defaultArea?.district ?? null;
    const address = this.buildAddress({
      province,
      city,
      district,
      community: base.community,
      buildingInfo: base.building_info,
    });

    try {
      const geocode = await tencentLbsService.geocodeAddress({
        address,
        region: city ?? district,
      });
      if (!geocode.ok) {
        return this.withDerivedStatus(payload, { ...base, province, city, district });
      }

      return {
        ...payload,
        province: geocode.province ?? province,
        city: geocode.city ?? city,
        district: geocode.district ?? district,
        adcode: geocode.adcode ?? base.adcode ?? defaultArea?.adcode ?? null,
        latitude: geocode.latitude,
        longitude: geocode.longitude,
        location_status: "geocoded",
        location_source: "tencent_geocoder",
        location_confidence: geocode.confidence,
        location_confirmed_at: null,
      };
    } catch {
      return this.withDerivedStatus(payload, { ...base, province, city, district });
    }
  }

  private isConfirmed(existing: ExistingPropertyLocation | null) {
    return existing?.location_status === "confirmed";
  }

  private mergeBase(
    payload: PropertyLocationFields,
    existing: ExistingPropertyLocation | null,
  ): ExistingPropertyLocation {
    return {
      community: payload.community ?? existing?.community ?? "",
      building_info: payload.building_info ?? existing?.building_info ?? null,
      province: payload.province ?? existing?.province ?? null,
      city: payload.city ?? existing?.city ?? null,
      district: payload.district ?? existing?.district ?? null,
      adcode: payload.adcode ?? existing?.adcode ?? null,
      latitude: payload.latitude ?? existing?.latitude ?? null,
      longitude: payload.longitude ?? existing?.longitude ?? null,
      location_status: payload.location_status ?? existing?.location_status ?? null,
    };
  }

  private shouldGeocode(
    payload: PropertyLocationFields,
    existing: ExistingPropertyLocation | null,
  ) {
    if (!existing) return true;
    if (payload.latitude != null && payload.longitude != null) return false;
    return LOCATION_ADDRESS_FIELDS.some((field) =>
      Object.prototype.hasOwnProperty.call(payload, field)
    );
  }

  private withDerivedStatus<TPayload extends PropertyLocationFields>(
    payload: TPayload,
    base: ExistingPropertyLocation,
  ): TPayload {
    if (payload.location_status) return payload;
    const hasCoordinate = base.latitude != null && base.longitude != null;
    const hasArea = Boolean(base.city || base.district || base.adcode);
    if (!hasCoordinate && !hasArea) return payload;

    return {
      ...payload,
      location_status: hasCoordinate && base.adcode ? "geocoded" : "partial",
      location_source: payload.location_source ?? "manual",
      location_confirmed_at: null,
    };
  }

  private async getDefaultTenantArea(tenantId: string) {
    const areas = await tenantServiceAreaRepository.listActiveForMatching();
    return areas.find((area) => area.tenant_id === tenantId) ?? null;
  }

  private buildAddress(input: {
    province: string | null;
    city: string | null;
    district: string | null;
    community: string;
    buildingInfo: string | null;
  }) {
    return [
      input.province,
      input.city,
      input.district,
      input.community,
      input.buildingInfo,
    ]
      .map((item) => item?.trim())
      .filter((item): item is string => Boolean(item))
      .join("");
  }
}

export const propertyLocationService = new PropertyLocationService();
