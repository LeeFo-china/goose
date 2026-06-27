import { Fragment, type ReactNode } from "react";
import { AlertTriangle, MapPinned, ShieldCheck } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { OpsEmptyState, OpsSection } from "@/components/ops/ops-section";
import type { LocationMetricsData, LocationMetricsWindow } from "@/components/ops/ops-types";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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

function WindowMetricCell({
  value,
  detail,
}: {
  value: ReactNode;
  detail: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function WindowNoMatchCell({ metrics }: { metrics: LocationMetricsWindow }) {
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

function MobileMetricItem({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
      <dd className="mt-1 truncate text-xs text-muted-foreground">{detail}</dd>
    </div>
  );
}

function WindowMetricsTable({ windows }: { windows: LocationMetricsWindow[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto border-y md:block">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-[9rem_repeat(4,minmax(7rem,1fr))_minmax(15rem,1.3fr)] gap-3 bg-muted/35 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>统计窗口</span>
            <span>定位上下文</span>
            <span>多装修公司</span>
            <span>无服务区域</span>
            <span>确认率</span>
            <span>来源 / 隐私</span>
          </div>
          {windows.map((metrics) => (
            <div
              key={metrics.window}
              className="grid grid-cols-[9rem_repeat(4,minmax(7rem,1fr))_minmax(15rem,1.3fr)] gap-3 border-t px-3 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {metrics.window === "24h" ? "最近 24 小时" : "最近 7 天"}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  自 {formatDateTime(metrics.since)}
                </div>
              </div>
              <WindowMetricCell
                value={metrics.total}
                detail={`活跃 ${metrics.active}，已确认 ${metrics.confirmed}`}
              />
              <WindowMetricCell
                value={metrics.multi_tenant}
                detail={`占比 ${formatPercent(ratio(metrics.multi_tenant, metrics.total))}`}
              />
              <WindowNoMatchCell metrics={metrics} />
              <WindowMetricCell
                value={formatPercent(metrics.confirmation_rate)}
                detail={`过期未确认 ${metrics.expired_unconfirmed}`}
              />
              <WindowMetricCell
                value={`手动 ${metrics.source_counts.manual_city || 0} / GPS ${metrics.source_counts.gps || 0}`}
                detail={`身份保护 ${metrics.identity_match}，原始坐标 ${metrics.raw_coordinate_stored}`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="divide-y border-y md:hidden">
        {windows.map((metrics) => (
          <section key={metrics.window} className="px-1 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium">
                  {metrics.window === "24h" ? "最近 24 小时" : "最近 7 天"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  自 {formatDateTime(metrics.since)}
                </div>
              </div>
              <Badge
                variant={metrics.no_match ? "warning" : "outline"}
                className="shrink-0"
              >
                无服务 {formatPercent(ratio(metrics.no_match, metrics.total))}
              </Badge>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <MobileMetricItem
                label="定位上下文"
                value={metrics.total}
                detail={`活跃 ${metrics.active}，已确认 ${metrics.confirmed}`}
              />
              <MobileMetricItem
                label="多装修公司"
                value={metrics.multi_tenant}
                detail={`占比 ${formatPercent(ratio(metrics.multi_tenant, metrics.total))}`}
              />
              <MobileMetricItem
                label="无服务区域"
                value={metrics.no_match}
                detail={`兜底 ${metrics.fallback_reason_counts.NO_SERVICE_AREA_MATCHED || 0}`}
              />
              <MobileMetricItem
                label="确认率"
                value={formatPercent(metrics.confirmation_rate)}
                detail={`过期未确认 ${metrics.expired_unconfirmed}`}
              />
              <MobileMetricItem
                label="来源"
                value={`手动 ${metrics.source_counts.manual_city || 0}`}
                detail={`GPS ${metrics.source_counts.gps || 0}`}
              />
              <MobileMetricItem
                label="隐私"
                value={`身份保护 ${metrics.identity_match}`}
                detail={`原始坐标 ${metrics.raw_coordinate_stored}`}
              />
            </dl>
          </section>
        ))}
      </div>
    </>
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
    <OpsSection
      title="定位匹配治理"
      description="观察登录定位、多装修公司候选、无服务区域和隐私坐标保存情况。"
      actions={
        <>
          <Badge variant={latest?.raw_coordinate_stored ? "warning" : "outline"}>
            <ShieldCheck className="size-3.5" data-icon="inline-start" />
            原始坐标 {latest?.raw_coordinate_stored || 0}
          </Badge>
          <Badge variant={latest?.expired_unconfirmed ? "warning" : "outline"}>
            待清理 {latest?.expired_unconfirmed || 0}
          </Badge>
        </>
      }
    >
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {metrics ? (
          <>
            <WindowMetricsTable windows={metrics.windows} />

            <section className="flex flex-col gap-3 border-t pt-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MapPinned data-icon="inline-start" />
                最近无服务区域
              </div>
              {metrics.recent_no_match.length ? (
                <div className="flex flex-col">
                  {metrics.recent_no_match.map((item) => (
                    <Fragment key={item.id}>
                      <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 text-sm md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{areaText(item)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.source} / {item.fallback_reason || "-"} / {item.adcode || "-"}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</div>
                      </div>
                      {item.id !== metrics.recent_no_match[metrics.recent_no_match.length - 1]?.id ? <Separator /> : null}
                    </Fragment>
                  ))}
                </div>
              ) : (
                <OpsEmptyState
                  title="没有无服务区域记录"
                  description="最近没有进入兜底的定位匹配。"
                />
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
    </OpsSection>
  );
}
