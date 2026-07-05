import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { TenantUsageSummaryData } from "@/components/usage/usage-types";

function formatNumber(
  value?: number | null,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat("zh-CN", options).format(value || 0);
}

export function UsageSummaryCards({ data }: { data: TenantUsageSummaryData }) {
  const failureTotal = data.ai.failure_count
    + data.sms.failure_count
    + data.social_video.failure_count;

  return (
    <div
      data-testid="usage-overview-panel"
      className="overflow-x-auto rounded-md border bg-background"
    >
      <div className="grid min-w-max grid-flow-col auto-cols-[minmax(9rem,1fr)] divide-x lg:min-w-0 lg:grid-flow-row lg:grid-cols-[1.25fr_repeat(3,minmax(0,1fr))]">
        <section className="min-w-60 p-2.5 lg:min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-foreground">用量概览</div>
            <Badge
              variant={failureTotal > 0 ? "danger" : "success"}
              className="tabular-nums"
            >
              失败 {formatNumber(failureTotal)}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            当前筛选范围内的用量汇总。
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              AI 调用 {formatNumber(data.ai.call_count)}
            </span>
            <Separator orientation="vertical" className="h-3" />
            <span className="tabular-nums">
              短信失败 {formatNumber(data.sms.failure_count)}
            </span>
            <Separator orientation="vertical" className="h-3" />
            <span className="tabular-nums">
              短视频失败 {formatNumber(data.social_video.failure_count)}
            </span>
          </div>
        </section>
        <UsageMetric
          label="AI Token"
          value={formatNumber(data.ai.total_tokens)}
          meta={`${formatNumber(data.ai.call_count)} 次调用`}
        />
        <UsageMetric
          label="短信发送"
          value={formatNumber(data.sms.send_count)}
          meta={`${formatNumber(data.sms.failure_count)} 条失败`}
        />
        <UsageMetric
          label="短视频转写"
          value={`${formatNumber(data.social_video.billable_minutes, {
            maximumFractionDigits: 1,
          })} 分钟`}
          meta={`${formatNumber(data.social_video.failure_count)} 条失败`}
        />
      </div>
    </div>
  );
}

function UsageMetric({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <section className="min-w-0 p-2.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums text-foreground">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
    </section>
  );
}
