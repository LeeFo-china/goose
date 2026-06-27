import { AlertTriangle, LocateFixed, MapPinned, ShieldCheck } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { LocationMetricsData, LocationMetricsWindow } from "@/components/ops/ops-types";
import { Badge } from "@/components/ui/badge";

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

function MetricBlock({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="min-w-[148px] flex-1 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function WindowSummary({ metrics }: { metrics: LocationMetricsWindow }) {
  return (
    <section className="space-y-3 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{metrics.window === "24h" ? "最近 24 小时" : "最近 7 天"}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            自 {formatDateTime(metrics.since)} 起统计
          </div>
        </div>
        <Badge variant={metrics.no_match ? "warning" : "success"}>
          无服务 {formatPercent(ratio(metrics.no_match, metrics.total))}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <MetricBlock
          label="定位上下文"
          value={metrics.total}
          detail={`活跃 ${metrics.active}，已确认 ${metrics.confirmed}`}
        />
        <MetricBlock
          label="多装修公司"
          value={metrics.multi_tenant}
          detail={`占比 ${formatPercent(ratio(metrics.multi_tenant, metrics.total))}`}
        />
        <MetricBlock
          label="无服务区域"
          value={metrics.no_match}
          detail={`兜底 ${metrics.fallback_reason_counts.NO_SERVICE_AREA_MATCHED || 0}`}
        />
        <MetricBlock
          label="确认率"
          value={formatPercent(metrics.confirmation_rate)}
          detail={`过期未确认 ${metrics.expired_unconfirmed}`}
        />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-2">
        <MetricBlock
          label="手动区域"
          value={metrics.source_counts.manual_city || 0}
          detail={`GPS ${metrics.source_counts.gps || 0}`}
        />
        <MetricBlock
          label="身份保护"
          value={metrics.identity_match}
          detail="match_reason=identity"
        />
        <MetricBlock
          label="原始坐标保存"
          value={metrics.raw_coordinate_stored}
          detail={metrics.raw_coordinate_stored ? "需确认隐私开关" : "符合默认隐私策略"}
        />
      </div>
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
    <section className="space-y-3">
      <div className="flex flex-col gap-3 border-b pb-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-normal">定位匹配治理</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            观察登录定位、多装修公司候选、无服务区域和隐私坐标保存情况。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={latest?.raw_coordinate_stored ? "warning" : "success"}>
            <ShieldCheck data-icon="inline-start" />
            原始坐标 {latest?.raw_coordinate_stored || 0}
          </Badge>
          <Badge variant={latest?.expired_unconfirmed ? "outline" : "secondary"}>
            待清理 {latest?.expired_unconfirmed || 0}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {metrics ? (
          <>
            <div className="space-y-4">
              {metrics.windows.map((item) => (
                <WindowSummary key={item.window} metrics={item} />
              ))}
            </div>

            <section className="border-t">
              <div className="flex items-center gap-2 py-3 text-sm font-medium">
                <MapPinned data-icon="inline-start" />
                最近无服务区域
              </div>
              {metrics.recent_no_match.length ? (
                <div className="divide-y">
                  {metrics.recent_no_match.map((item) => (
                    <div key={item.id} className="flex flex-col gap-2 py-3 text-sm md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{areaText(item)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.source} / {item.fallback_reason || "-"} / {item.adcode || "-"}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <LocateFixed data-icon="inline-start" />
                  最近没有无服务区域记录。
                </div>
              )}
            </section>

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
      </div>
    </section>
  );
}
