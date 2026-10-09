import type { TenantActivitySummary } from "@gooes/domain";

export const TENANT_ACTIVITY_COVERAGE_NOTICE = "小程序当前统计主动登录和业务操作，页面浏览待客户端接入";

type Props = { activity?: TenantActivitySummary };

function dateText(value: string | null | undefined, includeTime = false): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
  }).format(date);
}

function isPrecollection(activity: TenantActivitySummary): boolean {
  return activity.status === "collecting"
    && (!activity.collection_started_at || activity.observed_days === 0);
}

function statusText(activity?: TenantActivitySummary): string {
  if (!activity || isPrecollection(activity)) return "尚未采集";
  if (activity.status === "unavailable") return "统计暂不可用";
  if (activity.status === "collecting" || activity.observed_days < 7) return "采集中";
  return "近 7 日";
}

function countText(value: number | null | undefined, unit: string): string {
  return value == null ? "暂无统计" : `${value} ${unit}`;
}

export function TenantActivityCell({ activity }: Props) {
  const status = statusText(activity);
  if (!activity || isPrecollection(activity) || activity.status === "unavailable") {
    return <span className="text-xs text-muted-foreground">{status}</span>;
  }
  const recent = activity.last_active_at
    ? dateText(activity.last_active_at, true) ?? "日期暂不可用"
    : "暂无活跃记录";
  return (
    <div className="space-y-0.5 whitespace-nowrap text-xs leading-4">
      <div>最近 {recent}</div>
      <div className="text-muted-foreground">
        {status === "采集中" ? `采集中 ${activity.observed_days}/7 天` : "近 7 日"} · 后台 {activity.admin_active_employee_count ?? "—"} / 小程序 {activity.mini_active_employee_count ?? "—"} 人
      </div>
      <div className="text-muted-foreground">
        去重 {countText(activity.active_employee_count, "人")} · 活跃 {countText(activity.active_days, "天")}
      </div>
    </div>
  );
}

export function TenantActivitySection({ activity }: Props) {
  const available = activity && !isPrecollection(activity) && activity.status !== "unavailable" ? activity : undefined;
  const start = dateText(activity?.collection_started_at, true);
  const windowStart = dateText(activity?.window_start);
  const windowEnd = dateText(activity?.window_end);
  const metrics = [
    ["跨端去重员工", available?.active_employee_count, "人"],
    ["后台活跃员工", available?.admin_active_employee_count, "人"],
    ["小程序活跃员工", available?.mini_active_employee_count, "人"],
    ["活跃天数", available?.active_days, "天"],
    ["后台登录", available?.admin_login_count, "次"],
    ["小程序登录", available?.mini_login_count, "次"],
  ] as const;
  const actions = [
    ["新增客户", available?.business_actions?.customer_created],
    ["新增跟进", available?.business_actions?.follow_up_created],
    ["新增项目", available?.business_actions?.project_created],
    ["施工日志", available?.business_actions?.construction_log_created],
    ["处理验收", available?.business_actions?.acceptance_handled],
  ] as const;
  const missing = !activity || isPrecollection(activity) ? "尚未采集" : activity.status === "unavailable" ? "统计暂不可用" : "暂无统计";
  const metricText = (value: number | null | undefined, unit: string) => value == null ? missing : countText(value, unit);
  return (
    <section aria-labelledby="tenant-activity-title" className="border-y bg-card px-4 py-5 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tenant-activity-title" className="text-base font-semibold">使用情况 · 近 7 日</h2>
        <span className="text-sm text-muted-foreground">{statusText(activity)}</span>
      </div>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p>{windowStart && windowEnd ? `${windowStart} 至 ${windowEnd}（北京时间，含今天）` : "统计日期暂不可用（北京时间）"}</p>
        <p>{start ? `采集起点 ${start} · 已观察 ${activity?.observed_days} / 7 天` : "采集起点暂无记录"}；上线前历史不补计。</p>
        {available && (available.status === "collecting" || available.observed_days < 7) ? <p>近 7 日窗口尚未完整采集，以下为已观察时段的数据。</p> : null}
        <p>{TENANT_ACTIVITY_COVERAGE_NOTICE}</p>
      </div>
      <p className="mt-4 text-sm">
        最近活跃：{!available ? missing : available.last_active_at ? dateText(available.last_active_at, true) ?? "日期暂不可用" : "暂无活跃记录"}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map(([label, value, unit]) => <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{metricText(value, unit)}</dd>
        </div>)}
      </dl>
      <div className="mt-5 border-t pt-4">
        <h3 className="text-sm font-medium">成功业务操作</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
          {actions.map(([label, value]) => <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">{metricText(value, "次")}</dd>
          </div>)}
        </dl>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">主动浏览或成功业务操作计为活跃；登录单独计数。员工跨端去重，同一天多次使用只计 1 个活跃天。</p>
    </section>
  );
}
