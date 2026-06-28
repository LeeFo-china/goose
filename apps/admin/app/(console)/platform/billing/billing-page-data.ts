import type {
  BillingAiUsageFilterOptions,
  BillingAiUsageStats,
  BillingEventListData,
  BillingLedgerListData,
  BillingPlatformSummary,
  BillingPricingRuleListData,
  BillingTenantListData,
} from "@/components/billing/billing-types";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

export type SearchParams = Promise<{
  page?: string;
  pageSize?: string;
  ledgerPage?: string;
  ledgerPageSize?: string;
  rulePage?: string;
  rulePageSize?: string;
  eventPage?: string;
  eventPageSize?: string;
  tab?: string;
  tenantKeyword?: string;
  tenantStatus?: string;
  tenantLowBalance?: string;
  eventTenantKeyword?: string;
  eventMetricCode?: string;
  eventSceneCode?: string;
  eventSourceType?: string;
  eventStatus?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  aiTenantKeyword?: string;
  aiSceneCode?: string;
  aiProviderCode?: string;
  aiModelCode?: string;
  aiStartDate?: string;
  aiEndDate?: string;
  aiMinSampleCount?: string;
  ruleMetricCode?: string;
  ruleScope?: string;
  ruleEnabled?: string;
  ledgerTenantKeyword?: string;
  ledgerDirection?: string;
  ledgerMetricCode?: string;
  ledgerSourceType?: string;
  ledgerEventType?: string;
  ledgerKeyword?: string;
  ledgerStartDate?: string;
  ledgerEndDate?: string;
}>;

export type BillingTab = "tenants" | "events" | "ai" | "pricing" | "ledger";
export type QueryValue = string | number | boolean | undefined;

export const billingTabs: BillingTab[] = ["tenants", "events", "ai", "pricing", "ledger"];

export const emptySummary: BillingPlatformSummary = {
  tenant_count: 0,
  active_account_count: 0,
  total_balance_credits: 0,
  total_frozen_credits: 0,
  total_available_credits: 0,
  total_consumed_credits: 0,
  low_balance_count: 0,
  low_balance_threshold: 5000,
};

export const emptyAiUsageStats: BillingAiUsageStats = {
  range: { start_date: null, end_date: null },
  controls: { limit: 5000, min_sample_count: 100, safety_factor: 1.5 },
  totals: {
    groups: 0,
    logs: 0,
    billable_samples: 0,
    missing_usage: 0,
    ready_groups: 0,
    watch_groups: 0,
    pricing_rule_missing_groups: 0,
    usage_missing_groups: 0,
  },
  list: [],
};

export const emptyAiFilterOptions: BillingAiUsageFilterOptions = {
  tenants: [],
  scene_codes: [],
  scene_options: [],
  provider_codes: [],
  provider_options: [],
  models: [],
};

export { normalizePlatformListPageSize };

export function emptyTenantList(page: number, pageSize: number): BillingTenantListData {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
    low_balance_threshold: 5000,
  };
}

export function emptyLedgerList(page: number, pageSize: number): BillingLedgerListData {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}

export function emptyPricingList(page: number, pageSize: number): BillingPricingRuleListData {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}

export function emptyEventList(page: number, pageSize: number): BillingEventListData {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}

export function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeBillingTab(value: string | undefined): BillingTab {
  return billingTabs.includes(value as BillingTab) ? value as BillingTab : "tenants";
}

export function cleanParam(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function pickParam<T extends string>(value: string | undefined, options: readonly T[]) {
  return options.includes(value as T) ? value as T : undefined;
}

export function buildQuery(input: Record<string, QueryValue>) {
  const query = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

export async function fetchBackend<T>(path: string, fallback: T) {
  const token = await getAdminToken();
  if (!token) {
    return { data: fallback, error: "缺少登录凭证" };
  }

  try {
    const response = await fetch(buildBackendUrl(path), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<T>(response);
    return { data: payload.data || fallback, error: null };
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error.message : "计费数据加载失败",
    };
  }
}
