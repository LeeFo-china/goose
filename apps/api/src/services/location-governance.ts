import {
  type UserLocationContextRecord,
  userLocationContextRepository,
} from "@/repositories/user-location-contexts";
import type { AuthContext } from "@/services/authorization";
import { Errors } from "@/errors/error-factory";

type LocationContextMetricsWindow = {
  window: "24h" | "7d";
  since: string;
  total: number;
  active: number;
  expired_unconfirmed: number;
  confirmed: number;
  confirmation_rate: number;
  single_tenant: number;
  multi_tenant: number;
  no_match: number;
  identity_match: number;
  raw_coordinate_stored: number;
  low_accuracy: number;
  source_counts: Record<string, number>;
  match_reason_counts: Record<string, number>;
  fallback_reason_counts: Record<string, number>;
};

class LocationGovernanceService {
  async getMetrics(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const rows = await userLocationContextRepository.listForMetrics(since7d);

    return {
      generated_at: now.toISOString(),
      windows: [
        this.buildMetricsWindow("24h", since24h, rows, now),
        this.buildMetricsWindow("7d", since7d, rows, now),
      ],
      recent_no_match: rows
        .filter((item) => item.fallback_reason === "NO_SERVICE_AREA_MATCHED")
        .slice(0, 10)
        .map((item) => ({
          id: item.id,
          source: item.source,
          province: item.province,
          city: item.city,
          district: item.district,
          adcode: item.adcode,
          fallback_reason: item.fallback_reason,
          created_at: item.created_at,
        })),
    };
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  private buildMetricsWindow(
    window: "24h" | "7d",
    since: string,
    rows: UserLocationContextRecord[],
    now: Date,
  ): LocationContextMetricsWindow {
    const scoped = rows.filter((item) => new Date(item.created_at) >= new Date(since));
    const metrics = {
      active: 0,
      expiredUnconfirmed: 0,
      confirmed: 0,
      singleTenant: 0,
      multiTenant: 0,
      noMatch: 0,
      identityMatch: 0,
      rawCoordinateStored: 0,
      lowAccuracy: 0,
      sourceCounts: {} as Record<string, number>,
      matchReasonCounts: {} as Record<string, number>,
      fallbackReasonCounts: {} as Record<string, number>,
    };

    for (const item of scoped) {
      this.addRowMetrics(metrics, item, now);
    }

    return {
      window,
      since,
      total: scoped.length,
      active: metrics.active,
      expired_unconfirmed: metrics.expiredUnconfirmed,
      confirmed: metrics.confirmed,
      confirmation_rate: scoped.length ? Math.round((metrics.confirmed / scoped.length) * 10000) / 100 : 0,
      single_tenant: metrics.singleTenant,
      multi_tenant: metrics.multiTenant,
      no_match: metrics.noMatch,
      identity_match: metrics.identityMatch,
      raw_coordinate_stored: metrics.rawCoordinateStored,
      low_accuracy: metrics.lowAccuracy,
      source_counts: metrics.sourceCounts,
      match_reason_counts: metrics.matchReasonCounts,
      fallback_reason_counts: metrics.fallbackReasonCounts,
    };
  }

  private addRowMetrics(
    metrics: {
      active: number;
      expiredUnconfirmed: number;
      confirmed: number;
      singleTenant: number;
      multiTenant: number;
      noMatch: number;
      identityMatch: number;
      rawCoordinateStored: number;
      lowAccuracy: number;
      sourceCounts: Record<string, number>;
      matchReasonCounts: Record<string, number>;
      fallbackReasonCounts: Record<string, number>;
    },
    item: UserLocationContextRecord,
    now: Date,
  ) {
    metrics.sourceCounts[item.source] = (metrics.sourceCounts[item.source] || 0) + 1;
    const matchedTenants = Array.isArray(item.matched_tenants) ? item.matched_tenants : [];
    if (matchedTenants.length === 1) metrics.singleTenant += 1;
    if (matchedTenants.length > 1) metrics.multiTenant += 1;
    if (matchedTenants.length === 0) metrics.noMatch += 1;
    if (item.confirmed_at) metrics.confirmed += 1;
    if (new Date(item.expires_at) > now) metrics.active += 1;
    if (!item.confirmed_at && new Date(item.expires_at) <= now) metrics.expiredUnconfirmed += 1;
    if (item.latitude != null || item.longitude != null) metrics.rawCoordinateStored += 1;
    if (item.accuracy != null && item.accuracy > 500) metrics.lowAccuracy += 1;
    if (item.fallback_reason) {
      metrics.fallbackReasonCounts[item.fallback_reason] =
        (metrics.fallbackReasonCounts[item.fallback_reason] || 0) + 1;
    }

    for (const tenant of matchedTenants) {
      const reason = tenant.match_reason || "unknown";
      metrics.matchReasonCounts[reason] = (metrics.matchReasonCounts[reason] || 0) + 1;
      if (reason === "identity") metrics.identityMatch += 1;
    }
  }
}

export const locationGovernanceService = new LocationGovernanceService();
