import type { UsageTab } from "@/components/usage/usage-list-actions";
import type {
  TenantUsageSummaryData,
  UsageLogListData,
} from "@/components/usage/usage-types";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

export type TenantUsageSearchParams = Promise<{
  tab?: string;
  aiPage?: string;
  smsPage?: string;
  socialVideoPage?: string;
  ai_status?: string;
  sms_status?: string;
  social_video_status?: string;
  social_video_billable?: string;
  date_from?: string;
  date_to?: string;
}>;

export function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readTab(value: string | undefined): UsageTab {
  return value === "ai" || value === "sms" || value === "social_video" ? value : "summary";
}

export function readStatus(value: string | undefined, allowed: string[]) {
  return value && allowed.includes(value) ? value : "__all";
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function defaultDateFrom() {
  const now = new Date();
  return toDateOnly(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

export function defaultDateTo() {
  return toDateOnly(new Date());
}

export function buildQuery(input: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
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
      error: error instanceof Error ? error.message : "用量数据加载失败",
    };
  }
}

export function emptySummary(dateFrom: string, dateTo: string): TenantUsageSummaryData {
  return {
    range: { date_from: dateFrom, date_to: dateTo },
    tenant: { id: "", name: "当前租户", slug: "" },
    ai: {
      call_count: 0,
      success_count: 0,
      failure_count: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      missing_token_count: 0,
    },
    sms: {
      send_count: 0,
      success_count: 0,
      failure_count: 0,
      mock_count: 0,
      disabled_count: 0,
    },
    social_video: {
      transcription_count: 0,
      billable_transcription_count: 0,
      success_count: 0,
      failure_count: 0,
      duration_seconds: 0,
      billable_minutes: 0,
      missing_duration_count: 0,
    },
  };
}

export function emptyLogList<T>(page: number): UsageLogListData<T> {
  return {
    list: [],
    pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
  };
}
