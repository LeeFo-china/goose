import {
  Bot,
  Building2,
  Clapperboard,
  CircleDollarSign,
  TriangleAlert,
  Users,
} from "lucide-react";
import { PlatformOverviewCharts, type PlatformOverviewTrendPoint } from "@/components/dashboard/platform-overview-charts";
import { TenantOverviewCharts, type TenantOverviewTrendPoint } from "@/components/dashboard/tenant-overview-charts";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const roleLabel: Record<string, string> = {
  platform_admin: "平台超管",
  system_admin: "系统管理员",
  tenant_admin: "租户管理员",
};

type PlatformOverviewData = {
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

type TenantOverviewData = {
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

function getRoleLabel(role: string) {
  return roleLabel[role] || role;
}

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultPlatformDateFrom() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - 13);
  return toDateOnly(start);
}

function defaultPlatformDateTo() {
  return toDateOnly(new Date());
}

async function fetchPlatformOverview(dateFrom: string, dateTo: string) {
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

async function fetchTenantOverview(dateFrom: string, dateTo: string) {
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

function PlatformAdminDashboard({
  overview,
  error,
  dateFrom,
  dateTo,
}: {
  overview: PlatformOverviewData | null;
  error: string | null;
  dateFrom: string;
  dateTo: string;
}) {
  const summary = overview?.summary || {
    total_tenants: 0,
    active_tenants: 0,
    suspended_tenants: 0,
    new_tenants: 0,
    ai_tokens: 0,
    ai_calls: 0,
    ai_failures: 0,
    social_video_minutes: 0,
    social_video_tasks: 0,
    social_video_failures: 0,
  };
  const platformSummaryCards = [
    {
      label: "租户总数",
      value: `${formatNumber(summary.total_tenants)} 个`,
      description: `本期新增 ${formatNumber(summary.new_tenants)} 个`,
      icon: Building2,
      primary: true,
    },
    {
      label: "AI Token",
      value: formatNumber(summary.ai_tokens),
      description: `调用 ${formatNumber(summary.ai_calls)} 次`,
      icon: Bot,
    },
    {
      label: "视频转文本",
      value: `${formatNumber(summary.social_video_minutes)} 分钟`,
      description: `任务 ${formatNumber(summary.social_video_tasks)} 条`,
      icon: Clapperboard,
    },
    {
      label: "失败记录",
      value: formatNumber(summary.ai_failures + summary.social_video_failures),
      description: `AI ${formatNumber(summary.ai_failures)} / 视频 ${formatNumber(summary.social_video_failures)}`,
      icon: TriangleAlert,
      warning: true,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">平台概览</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看租户增长、AI token 和视频转文本分钟趋势，用于判断平台增长和成本变化。
          </p>
        </div>
        <Badge variant="outline">{dateFrom} 至 {dateTo}</Badge>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <div className="grid gap-3 md:grid-cols-4">
        {platformSummaryCards.map((item) => {
          const Icon = item.icon;

          return (
            <Card key={item.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={item.primary
                  ? "flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground"
                  : item.warning
                    ? "flex size-10 items-center justify-center rounded-md bg-destructive text-destructive-foreground"
                    : "flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground"}
                >
                  <Icon />
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-muted-foreground">{item.label}</div>
                  <div className="truncate text-xl font-semibold">{item.value}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.description}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PlatformOverviewCharts trend={overview?.trend || []} />
    </div>
  );
}

function TenantAdminDashboard({
  overview,
  error,
  dateFrom,
  dateTo,
}: {
  overview: TenantOverviewData | null;
  error: string | null;
  dateFrom: string;
  dateTo: string;
}) {
  const summary = overview?.summary || {
    total_customers: 0,
    new_customers: 0,
    total_projects: 0,
    active_projects: 0,
    pending_expense_count: 0,
    pending_expense_amount: 0,
    ai_tokens: 0,
    ai_calls: 0,
    ai_failures: 0,
    social_video_minutes: 0,
    social_video_tasks: 0,
    social_video_failures: 0,
  };
  const summaryCards = [
    {
      label: "客户总数",
      value: `${formatNumber(summary.total_customers)} 个`,
      description: `本期新增 ${formatNumber(summary.new_customers)} 个`,
      icon: Users,
      primary: true,
    },
    {
      label: "项目总数",
      value: `${formatNumber(summary.total_projects)} 个`,
      description: `施工相关 ${formatNumber(summary.active_projects)} 个`,
      icon: Building2,
    },
    {
      label: "待审批费用",
      value: `${formatNumber(summary.pending_expense_count)} 条`,
      description: `金额 ${formatNumber(summary.pending_expense_amount)} 元`,
      icon: CircleDollarSign,
    },
    {
      label: "AI Token",
      value: formatNumber(summary.ai_tokens),
      description: `调用 ${formatNumber(summary.ai_calls)} 次`,
      icon: Bot,
    },
    {
      label: "视频转文本",
      value: `${formatNumber(summary.social_video_minutes)} 分钟`,
      description: `任务 ${formatNumber(summary.social_video_tasks)} 条`,
      icon: Clapperboard,
    },
    {
      label: "失败记录",
      value: formatNumber(summary.ai_failures + summary.social_video_failures),
      description: `AI ${formatNumber(summary.ai_failures)} / 视频 ${formatNumber(summary.social_video_failures)}`,
      icon: TriangleAlert,
      warning: true,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">租户概览</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看客户增长、项目推进、费用待处理、AI token 和视频转文本分钟趋势。
          </p>
        </div>
        <Badge variant="outline">{dateFrom} 至 {dateTo}</Badge>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {summaryCards.map((item) => {
          const Icon = item.icon;

          return (
            <Card key={item.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={item.primary
                  ? "flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground"
                  : item.warning
                    ? "flex size-10 items-center justify-center rounded-md bg-destructive text-destructive-foreground"
                    : "flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground"}
                >
                  <Icon />
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-muted-foreground">{item.label}</div>
                  <div className="truncate text-xl font-semibold">{item.value}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.description}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <TenantOverviewCharts trend={overview?.trend || []} />
    </div>
  );
}

export default async function DashboardPage() {
  const dateFrom = defaultPlatformDateFrom();
  const dateTo = defaultPlatformDateTo();
  const session = await getAdminSession();

  if (session?.roles.includes("platform_admin")) {
    const overviewResult = await fetchPlatformOverview(dateFrom, dateTo);
    return (
      <PlatformAdminDashboard
        overview={overviewResult.data}
        error={overviewResult.error}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />
    );
  }

  const overviewResult = await fetchTenantOverview(dateFrom, dateTo);
  return (
    <TenantAdminDashboard
      overview={overviewResult.data}
      error={overviewResult.error}
      dateFrom={dateFrom}
      dateTo={dateTo}
    />
  );
}
