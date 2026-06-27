import type { ReactNode } from "react";
import { AlertTriangle, ChevronDown, MapPinned, ShieldCheck } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { LocationMetricsData, LocationMetricsWindow } from "@/components/ops/ops-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ratio(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function areaText(item: LocationMetricsData["recent_no_match"][number]) {
  return [item.province, item.city, item.district].filter(Boolean).join(" ") || item.adcode || "-";
}

function sourceLabel(value: LocationMetricsData["recent_no_match"][number]["source"]) {
  if (value === "manual_city") return "手动城市";
  if (value === "manual_address") return "手动地址";
  return "GPS";
}

function MetricStack({
  value,
  detail,
}: {
  value: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function NoMatchMetricCell({ metrics }: { metrics: LocationMetricsWindow }) {
  const noMatchRate = ratio(metrics.no_match, metrics.total);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">{metrics.no_match}</span>
        <Badge
          variant={metrics.no_match ? "warning" : "outline"}
          className="px-1.5 py-0 text-[11px]"
        >
          {formatPercent(noMatchRate)}
        </Badge>
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">
        兜底 {metrics.fallback_reason_counts.NO_SERVICE_AREA_MATCHED || 0}
      </div>
    </div>
  );
}

function WindowMetricsTable({ windows }: { windows: LocationMetricsWindow[] }) {
  return (
    <Table className="min-w-[920px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-36">统计窗口</TableHead>
          <TableHead>定位上下文</TableHead>
          <TableHead>多装修公司</TableHead>
          <TableHead>无服务区域</TableHead>
          <TableHead>确认率</TableHead>
          <TableHead className="min-w-56">来源 / 隐私</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {windows.map((metrics) => (
          <TableRow key={metrics.window}>
            <TableCell>
              <div className="font-medium">
                {metrics.window === "24h" ? "最近 24 小时" : "最近 7 天"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                自 {formatDateTime(metrics.since)}
              </div>
            </TableCell>
            <TableCell>
              <MetricStack
                value={metrics.total}
                detail={`活跃 ${metrics.active}，已确认 ${metrics.confirmed}`}
              />
            </TableCell>
            <TableCell>
              <MetricStack
                value={metrics.multi_tenant}
                detail={`占比 ${formatPercent(ratio(metrics.multi_tenant, metrics.total))}`}
              />
            </TableCell>
            <TableCell>
              <NoMatchMetricCell metrics={metrics} />
            </TableCell>
            <TableCell>
              <MetricStack
                value={formatPercent(metrics.confirmation_rate)}
                detail={`过期未确认 ${metrics.expired_unconfirmed}`}
              />
            </TableCell>
            <TableCell>
              <MetricStack
                value={`手动 ${metrics.source_counts.manual_city || 0} / GPS ${metrics.source_counts.gps || 0}`}
                detail={`身份保护 ${metrics.identity_match} / 原始坐标 ${metrics.raw_coordinate_stored}`}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function NoMatchRow({
  item,
}: {
  item: LocationMetricsData["recent_no_match"][number];
}) {
  return (
    <div className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_9rem] md:items-start">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{areaText(item)}</span>
          <Badge variant="outline" className="shrink-0">
            {sourceLabel(item.source)}
          </Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {item.fallback_reason || "-"} / {item.adcode || "-"}
        </div>
      </div>
      <div className="text-xs text-muted-foreground md:text-right">
        {formatDateTime(item.created_at)}
      </div>
    </div>
  );
}

function RecentNoMatchList({
  items,
}: {
  items: LocationMetricsData["recent_no_match"];
}) {
  const visibleItems = items.slice(0, 3);
  const collapsedItems = items.slice(3);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MapPinned data-icon="inline-start" />
          最近无服务区域
        </div>
        <Badge variant="outline">共 {items.length} 条</Badge>
      </div>
      {items.length ? (
        <div className="divide-y rounded-md border">
          {visibleItems.map((item) => (
            <NoMatchRow key={item.id} item={item} />
          ))}
          {collapsedItems.length ? (
            <Collapsible>
              <CollapsibleContent className="divide-y">
                {collapsedItems.map((item) => (
                  <NoMatchRow key={item.id} item={item} />
                ))}
              </CollapsibleContent>
              <div className="border-t p-2">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="group w-full text-muted-foreground"
                  >
                    <span className="group-data-[state=open]:hidden">
                      展开剩余 {collapsedItems.length} 条
                    </span>
                    <span className="hidden group-data-[state=open]:inline">收起明细</span>
                    <ChevronDown
                      className="transition-transform group-data-[state=open]:rotate-180"
                      data-icon="inline-end"
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </Collapsible>
          ) : null}
        </div>
      ) : (
        <Empty className="min-h-24 rounded-md bg-muted/20 p-6 md:p-8">
          <EmptyHeader>
            <EmptyTitle>没有无服务区域记录</EmptyTitle>
            <EmptyDescription>最近没有进入兜底的定位匹配。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}

export function LocationMetricsPanel({
  metrics,
  error,
}: {
  metrics: LocationMetricsData | null;
  error?: string | null;
}) {
  const latest = metrics?.windows.find((item) => item.window === "24h") || null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>定位匹配治理</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            观察登录定位、多装修公司候选、无服务区域和隐私坐标保存情况。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={latest?.raw_coordinate_stored ? "warning" : "outline"}>
            <ShieldCheck data-icon="inline-start" />
            原始坐标 {latest?.raw_coordinate_stored || 0}
          </Badge>
          <Badge variant={latest?.expired_unconfirmed ? "warning" : "outline"}>
            待清理 {latest?.expired_unconfirmed || 0}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {metrics ? (
          <>
            <WindowMetricsTable windows={metrics.windows} />
            <RecentNoMatchList items={metrics.recent_no_match} />
            {latest?.low_accuracy ? (
              <StatusAlert>
                <span className="inline-flex items-center gap-2">
                  <AlertTriangle data-icon="inline-start" />
                  最近 24 小时存在 {latest.low_accuracy} 条低精度定位，建议小程序侧埋点观察授权和定位质量。
                </span>
              </StatusAlert>
            ) : null}
          </>
        ) : error ? null : (
          <StatusAlert>定位匹配统计暂无数据。</StatusAlert>
        )}
      </CardContent>
    </Card>
  );
}
