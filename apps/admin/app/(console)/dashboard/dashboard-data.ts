import type { PlatformOverviewTrendPoint } from "@/components/dashboard/platform-overview-charts";
import type { TenantOverviewTrendPoint } from "@/components/dashboard/tenant-overview-charts";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

export type PlatformOverviewData = {
  range: {
    date_from: string;
    date_to: string;
  };
  summary: {
    total_tenants: number;
    active_tenants: number;
    suspended_tenants: number;
    new_tenants: number;
    ai_tokens: number;
    ai_calls: number;
    ai_failures: number;
    social_video_minutes: number;
    social_video_tasks: number;
    social_video_failures: number;
  };
  trend: PlatformOverviewTrendPoint[];
};

export type TenantOverviewData = {
  range: {
    date_from: string;
    date_to: string;
  };
  tenant: {
    id: string;
    name: string | null;
    slug: string | null;
  };
  summary: {
    total_customers: number;
    new_customers: number;
    total_projects: number;
    active_projects: number;
    pending_expense_count: number;
    pending_expense_amount: number;
    ai_tokens: number;
    ai_calls: number;
    ai_failures: number;
    social_video_minutes: number;
    social_video_tasks: number;
    social_video_failures: number;
  };
  project_status_counts: Record<string, number>;
  trend: TenantOverviewTrendPoint[];
};

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function defaultPlatformDateFrom() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - 13);
  return toDateOnly(start);
}

export function defaultPlatformDateTo() {
  return toDateOnly(new Date());
}

export async function fetchPlatformOverview(dateFrom: string, dateTo: string) {
  const token = await getAdminToken();
  if (!token) {
    return {
      data: null,
      error: "缺少登录凭证",
    };
  }

  try {
    const query = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
    });
    const response = await fetch(
      buildBackendUrl(`/platform/usage/overview?${query.toString()}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<PlatformOverviewData>(response);
    return {
      data: payload.data || null,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "平台概览数据加载失败",
    };
  }
}

export async function fetchTenantOverview(dateFrom: string, dateTo: string) {
  const token = await getAdminToken();
  if (!token) {
    return {
      data: null,
      error: "缺少登录凭证",
    };
  }

  try {
    const query = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
    });
    const response = await fetch(
      buildBackendUrl(`/usage/overview?${query.toString()}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<TenantOverviewData>(response);
    return {
      data: payload.data || null,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "租户概览数据加载失败",
    };
  }
}
