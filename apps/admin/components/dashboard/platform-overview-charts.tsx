"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type PlatformOverviewTrendPoint = {
  date: string;
  new_tenants: number;
  ai_tokens: number;
  ai_calls: number;
  ai_failures: number;
  social_video_minutes: number;
  social_video_tasks: number;
  social_video_failures: number;
};

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function formatDate(value: string) {
  return value.slice(5);
}

function ChartTooltip({ active, payload, label, unit }: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string }>;
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((item) => (
        <div key={item.name} className="text-muted-foreground">
          {item.name}：{formatNumber(item.value)}{unit}
        </div>
      ))}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      暂无趋势数据
    </div>
  );
}

export function PlatformOverviewCharts({ trend }: { trend: PlatformOverviewTrendPoint[] }) {
  const hasData = trend.some((item) =>
    item.new_tenants > 0 ||
    item.ai_tokens > 0 ||
    item.social_video_minutes > 0
  );

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>租户增长趋势</CardTitle>
          <CardDescription>按天统计新增租户数量。</CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip unit=" 个" />} />
                  <Line
                    type="monotone"
                    dataKey="new_tenants"
                    name="新增租户"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Token 用量</CardTitle>
          <CardDescription>按天统计平台 AI token 消耗。</CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={formatNumber} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip unit="" />} />
                  <Bar
                    dataKey="ai_tokens"
                    name="AI Token"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>视频转文本分钟</CardTitle>
          <CardDescription>按天统计短视频转文本计费分钟。</CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip unit=" 分钟" />} />
                  <Bar
                    dataKey="social_video_minutes"
                    name="视频转文本"
                    fill="hsl(var(--secondary-foreground))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
