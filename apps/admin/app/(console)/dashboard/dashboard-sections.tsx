import {
  Bot,
  Building2,
  Clapperboard,
  CircleDollarSign,
  TriangleAlert,
  Users,
} from "lucide-react";
import { PlatformOverviewCharts } from "@/components/dashboard/platform-overview-charts";
import { TenantOverviewCharts } from "@/components/dashboard/tenant-overview-charts";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PlatformOverviewData, TenantOverviewData } from "./dashboard-data";

const DASHBOARD_SHELL_CLASS =
  "flex h-full min-h-0 flex-col gap-4 overflow-hidden";

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

export function PlatformAdminDashboard({
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
    <div className={DASHBOARD_SHELL_CLASS}>
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

export function TenantAdminDashboard({
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
    <div className={DASHBOARD_SHELL_CLASS}>
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
