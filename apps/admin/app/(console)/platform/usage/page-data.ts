import type { UsageTab } from "@/components/usage/usage-list-actions";
import type {
  PlatformTenantUsageData,
  TenantUsageSummaryData,
  UsageLogListData,
} from "@/components/usage/usage-types";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

export type PlatformUsageSearchParams = Promise<{
  tab?: string;
  page?: string;
  aiPage?: string;
  smsPage?: string;
  socialVideoPage?: string;
  keyword?: string;
  tenant_id?: string;
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

export function emptyPlatformUsage(params: { page: number; dateFrom: string; dateTo: string }): PlatformTenantUsageData {
  return {
    range: { date_from: params.dateFrom, date_to: params.dateTo },
    list: [],
    pagination: { page: params.page, pageSize: 20, total: 0, totalPages: 0 },
  };
}

export function emptyLogList<T>(page: number): UsageLogListData<T> {
  return {
    list: [],
    pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
  };
}

export function summarizePage(data: PlatformTenantUsageData): TenantUsageSummaryData {
  return {
    range: data.range,
    tenant: { id: "platform", name: "当前页租户合计", slug: "platform" },
    ai: data.list.reduce((summary, item) => ({
      call_count: summary.call_count + item.ai.call_count,
      success_count: summary.success_count + item.ai.success_count,
      failure_count: summary.failure_count + item.ai.failure_count,
      prompt_tokens: summary.prompt_tokens + item.ai.prompt_tokens,
      completion_tokens: summary.completion_tokens + item.ai.completion_tokens,
      total_tokens: summary.total_tokens + item.ai.total_tokens,
      missing_token_count: summary.missing_token_count + item.ai.missing_token_count,
    }), {
      call_count: 0,
      success_count: 0,
      failure_count: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      missing_token_count: 0,
    }),
    sms: data.list.reduce((summary, item) => ({
      send_count: summary.send_count + item.sms.send_count,
      success_count: summary.success_count + item.sms.success_count,
      failure_count: summary.failure_count + item.sms.failure_count,
      mock_count: summary.mock_count + item.sms.mock_count,
      disabled_count: summary.disabled_count + item.sms.disabled_count,
    }), {
      send_count: 0,
      success_count: 0,
      failure_count: 0,
      mock_count: 0,
      disabled_count: 0,
    }),
    social_video: data.list.reduce((summary, item) => ({
      transcription_count: summary.transcription_count + item.social_video.transcription_count,
      billable_transcription_count: summary.billable_transcription_count + item.social_video.billable_transcription_count,
      success_count: summary.success_count + item.social_video.success_count,
      failure_count: summary.failure_count + item.social_video.failure_count,
      duration_seconds: summary.duration_seconds + item.social_video.duration_seconds,
      billable_minutes: summary.billable_minutes + item.social_video.billable_minutes,
      missing_duration_count: summary.missing_duration_count + item.social_video.missing_duration_count,
    }), {
      transcription_count: 0,
      billable_transcription_count: 0,
      success_count: 0,
      failure_count: 0,
      duration_seconds: 0,
      billable_minutes: 0,
      missing_duration_count: 0,
    }),
  };
}
