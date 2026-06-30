import {
  BarChart3,
  Bot,
  CheckCircle2,
  Clapperboard,
  MessageSquareText,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { TenantUsageSummaryData } from "@/components/usage/usage-types";

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function formatPercent(part: number, total: number) {
  if (total <= 0) return "-";
  return `${Math.round((part / total) * 100)}%`;
}

export function UsageOverviewPanel({ data }: { data: TenantUsageSummaryData }) {
  const aiSuccessRate = formatPercent(data.ai.success_count, data.ai.call_count);
  const smsSuccessRate = formatPercent(data.sms.success_count, data.sms.send_count);
  const videoSuccessRate = formatPercent(
    data.social_video.success_count,
    data.social_video.transcription_count,
  );
  const failureCount =
    data.ai.failure_count +
    data.sms.failure_count +
    data.social_video.failure_count;
  const missingCount =
    data.ai.missing_token_count +
    data.social_video.missing_duration_count;

  return (
    <div className="space-y-4 p-4">
      <div className="overflow-hidden rounded-md border bg-background">
        <div className="grid divide-y md:grid-cols-5 md:divide-x md:divide-y-0">
          <UsageMetric
            icon={<Bot aria-hidden="true" className="size-4" />}
            label="AI Token"
            value={formatNumber(data.ai.total_tokens)}
            helper={`${formatNumber(data.ai.call_count)} 次调用`}
          />
          <UsageMetric
            icon={<BarChart3 aria-hidden="true" className="size-4" />}
            label="AI 调用"
            value={formatNumber(data.ai.call_count)}
            helper={`成功率 ${aiSuccessRate}`}
          />
          <UsageMetric
            icon={<MessageSquareText aria-hidden="true" className="size-4" />}
            label="短信发送"
            value={formatNumber(data.sms.send_count)}
            helper={`成功率 ${smsSuccessRate}`}
          />
          <UsageMetric
            icon={<Clapperboard aria-hidden="true" className="size-4" />}
            label="短视频转写"
            value={`${formatNumber(data.social_video.billable_minutes)} 分钟`}
            helper={`${formatNumber(data.social_video.transcription_count)} 个任务`}
          />
          <UsageMetric
            icon={<TriangleAlert aria-hidden="true" className="size-4" />}
            label="失败记录"
            value={formatNumber(failureCount)}
            helper={`缺失 ${formatNumber(missingCount)} 项`}
            tone={failureCount > 0 ? "danger" : "muted"}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-md border bg-background p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">运行质量</h2>
            <p className="text-sm text-muted-foreground">
              按当前日期范围汇总成功率、计费量和失败记录。
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <QualityItem
              label="AI 成功率"
              value={aiSuccessRate}
              helper={`${formatNumber(data.ai.success_count)} / ${formatNumber(data.ai.call_count)} 次`}
            />
            <QualityItem
              label="短信成功率"
              value={smsSuccessRate}
              helper={`${formatNumber(data.sms.success_count)} / ${formatNumber(data.sms.send_count)} 条`}
            />
            <QualityItem
              label="短视频成功率"
              value={videoSuccessRate}
              helper={`${formatNumber(data.social_video.success_count)} / ${formatNumber(data.social_video.transcription_count)} 个任务`}
            />
          </div>
        </section>

        <section className="rounded-md border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">缺失和异常</h2>
              <p className="mt-1 text-sm text-muted-foreground">优先核查影响计费的记录。</p>
            </div>
            <Badge variant={failureCount > 0 ? "danger" : "success"}>
              {failureCount > 0 ? "需关注" : "正常"}
            </Badge>
          </div>
          <Separator className="my-4" />
          <div className="space-y-3">
            <ExceptionItem label="AI token 缺失" value={data.ai.missing_token_count} />
            <ExceptionItem
              label="短视频时长缺失"
              value={data.social_video.missing_duration_count}
            />
            <ExceptionItem label="短信失败" value={data.sms.failure_count} />
            <ExceptionItem label="短视频失败" value={data.social_video.failure_count} />
          </div>
        </section>
      </div>
    </div>
  );
}

function UsageMetric({
  icon,
  label,
  value,
  helper,
  tone = "muted",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
  tone?: "muted" | "danger";
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 p-4">
      <span
        className={[
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
          tone === "danger"
            ? "bg-destructive text-destructive-foreground"
            : "bg-secondary text-secondary-foreground",
        ].join(" ")}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 truncate text-xl font-semibold tabular-nums">{value}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{helper}</div>
      </div>
    </div>
  );
}

function QualityItem({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-md border bg-card px-3 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 aria-hidden="true" className="size-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

function ExceptionItem({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const hasIssue = value > 0;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant={hasIssue ? "warning" : "outline"} className="tabular-nums">
        {formatNumber(value)}
      </Badge>
    </div>
  );
}
