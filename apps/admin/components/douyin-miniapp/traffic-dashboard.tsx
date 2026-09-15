import Link from "next/link";
import { Activity, ArrowRight, MousePointerClick, Users } from "lucide-react";
import { z } from "zod";

import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader,
  TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TrafficTrendChart } from "./traffic-trend-chart";

const basis = z.enum(["official_video", "official_live", "official_account",
  "manual", "unidentified"]);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const dateTime = z.iso.datetime({ offset: true });
const stageCounts = { entries: count, visitors: count, page_views: count,
  lead_clicks: count, appointments: count };
const sourceRow = z.strictObject({
  source_key: z.string().min(1).max(300), basis,
  source_type: z.enum(["short_video", "live", "search", "profile", "share",
    "direct", "other"]).nullable(),
  account_id: z.string().min(1).max(256).nullable(),
  video_id: z.string().min(1).max(256).nullable(),
  live_room_id: z.string().min(1).max(256).nullable(),
  ...stageCounts,
});
const statsSchema = z.strictObject({
  window_start: dateTime, window_end: dateTime,
  first_captured_at: dateTime.nullable(),
  overview: z.strictObject({ ...stageCounts, lead_people: count }),
  daily: z.array(z.strictObject({ date: z.iso.date(), ...stageCounts })).max(90),
  source_types: z.array(z.strictObject({ basis, ...stageCounts })).max(5),
  sources: z.strictObject({
    list: z.array(sourceRow).max(20),
    pagination: z.strictObject({ page: count.min(1),
      pageSize: count.min(1).max(20), total: count, totalPages: count }),
  }),
});

export type TrafficStats = z.infer<typeof statsSchema>;
export type TrafficFilters = { days: 7 | 30 | 90;
  groupBy: "content" | "account"; page: number };

export function parseTrafficFilters(params: URLSearchParams): TrafficFilters {
  const days = params.get("days");
  const groupBy = params.get("groupBy");
  const page = Number(params.get("page"));
  return {
    days: days === "30" ? 30 : days === "90" ? 90 : 7,
    groupBy: groupBy === "account" ? "account" : "content",
    page: Number.isSafeInteger(page) && page > 0 && page <= 10000 ? page : 1,
  };
}

export function buildTrafficHref(filters: TrafficFilters): string {
  return `/douyin-miniapp/traffic?days=${filters.days}&groupBy=${filters.groupBy}`
    + `&page=${filters.page}`;
}

export function normalizeTrafficStats(value: unknown,
  filters: TrafficFilters): TrafficStats | null {
  const parsed = statsSchema.safeParse(value);
  if (!parsed.success) return null;
  const stats = parsed.data;
  if (stats.daily.length !== filters.days
    || stats.sources.pagination.page !== filters.page
    || stats.sources.pagination.pageSize !== 20
    || stats.sources.list.length > 20) return null;
  return stats;
}

const basisLabels: Record<TrafficStats["source_types"][number]["basis"], string> = {
  official_video: "抖音官方识别 · 视频",
  official_live: "抖音官方识别 · 直播",
  official_account: "抖音官方识别 · 账号",
  manual: "链接参数 · 手工标记",
  unidentified: "未识别",
};

function number(value: number): string {
  return value.toLocaleString("zh-CN");
}

function efficiency(entries: number, appointments: number): string {
  return entries >= 10 ? number(Math.round(appointments / entries * 100))
    : "样本不足";
}

function countCard(label: string, value: number, hint: string,
  Icon: typeof Activity) {
  return <Card key={label} className="min-w-0 shadow-none">
    <CardContent className="p-4 lg:p-5">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span><Icon aria-hidden="true" className="size-4" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{number(value)}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </CardContent>
  </Card>;
}

function sourceLabel(row: TrafficStats["sources"]["list"][number]): string {
  if (row.basis === "unidentified") return "未识别入口";
  if (row.basis === "manual") return row.source_key.replace(/^manual:/, "");
  if (row.video_id) return `视频 ID：${row.video_id}`;
  if (row.live_room_id) return `直播间 ID：${row.live_room_id}`;
  if (row.account_id) return `账号 ID：${row.account_id}`;
  return row.source_key;
}

function sourceBadge(rowBasis: TrafficStats["source_types"][number]["basis"]) {
  return <Badge variant={rowBasis === "unidentified" ? "secondary"
    : rowBasis === "manual" ? "outline" : "success"}>
    {basisLabels[rowBasis]}
  </Badge>;
}

function FilterLink({ href, selected, children }: {
  href: string; selected: boolean; children: React.ReactNode;
}) {
  return <Link href={href} aria-current={selected ? "page" : undefined}
    className={cn("inline-flex min-h-9 items-center justify-center rounded-md border px-3 text-sm transition-colors hover:bg-muted",
      selected && "border-primary bg-primary/5 font-medium text-primary")}>{children}</Link>;
}

export function TrafficDashboard({ data, filters, error }: {
  data: TrafficStats | null; filters: TrafficFilters; error: string | null;
}) {
  const totals = data?.overview;
  return <main className="flex h-full min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 [scrollbar-gutter:stable] lg:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">流量来源统计</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          小程序内部入口、浏览和免费量房预约。按北京时间自然日统计。
        </p>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="统计日期范围">
        {([7, 30, 90] as const).map((days) => <FilterLink key={days}
          href={buildTrafficHref({ ...filters, days, page: 1 })}
          selected={filters.days === days}>近 {days} 天</FilterLink>)}
      </div>
    </header>

    <StatusAlert tone="warning">
      仅统计新版入口采集后的站内行为与匹配到入口的预约；旧版事件不回填。
      抖音平台曝光、播放和站外点击暂未接入。
    </StatusAlert>
    {error ? <StatusAlert title="统计读取失败">{error}</StatusAlert> : null}
    {!error && !data ? <StatusAlert title="统计响应无效">请刷新页面重试</StatusAlert> : null}
    {!error && data ? <>
      <section aria-label="流量漏斗" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {countCard("入口次数", totals!.entries, "新版小程序进入事件", ArrowRight)}
        {countCard("访问人数", totals!.visitors, "去重匿名访问者", Users)}
        {countCard("页面浏览", totals!.page_views, "站内页面浏览事件", Activity)}
        {countCard("量房入口点击", totals!.lead_clicks, "免费量房按钮点击", MousePointerClick)}
        {countCard("预约提交", totals!.appointments, "已成功创建的量房预约", ArrowRight)}
        {countCard("预约人数", totals!.lead_people, "去重匿名预约者", Users)}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Card className="min-w-0 shadow-none">
          <CardHeader className="pb-3"><CardTitle>每日趋势</CardTitle></CardHeader>
          <CardContent className="pt-0"><TrafficTrendChart data={data.daily} /></CardContent>
        </Card>
        <Card className="min-w-0 shadow-none">
          <CardHeader className="pb-3"><CardTitle>来源识别覆盖</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-0">
            {data.source_types.length ? data.source_types.map((row) =>
              <div key={row.basis} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                <span className="text-sm">{basisLabels[row.basis]}</span>
                <span className="shrink-0 text-sm tabular-nums">{number(row.entries)} 次进入</span>
              </div>) : <p className="text-sm text-muted-foreground">暂无新版入口数据</p>}
            <p className="text-xs text-muted-foreground">
              统计仅包含新版入口采集。首次捕获：
              {data.first_captured_at ? new Intl.DateTimeFormat("zh-CN", {
                timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit",
                day: "2-digit", hour: "2-digit", minute: "2-digit",
              }).format(new Date(data.first_captured_at)) : "暂无"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 shadow-none">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div><CardTitle>来源排行</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">每百次进入的预约数为阶段效率，样本少于 10 次时不展示。</p>
          </div>
          <div className="flex gap-2" aria-label="来源分组">
            <FilterLink href={buildTrafficHref({ ...filters, groupBy: "content", page: 1 })}
              selected={filters.groupBy === "content"}>按内容</FilterLink>
            <FilterLink href={buildTrafficHref({ ...filters, groupBy: "account", page: 1 })}
              selected={filters.groupBy === "account"}>按账号</FilterLink>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {data.sources.list.length ? <Table className="min-w-[860px]">
            <TableHeader><TableRow>
              <TableHead>来源</TableHead><TableHead>识别依据</TableHead>
              <TableHead className="text-right">进入</TableHead>
              <TableHead className="text-right">访问者</TableHead>
              <TableHead className="text-right">浏览</TableHead>
              <TableHead className="text-right">量房点击</TableHead>
              <TableHead className="text-right">预约</TableHead>
              <TableHead className="text-right">每百次进入预约</TableHead>
            </TableRow></TableHeader>
            <TableBody>{data.sources.list.map((row) => <TableRow key={`${row.basis}:${row.source_key}`}>
              <TableCell className="max-w-64 truncate font-medium" title={sourceLabel(row)}>
                {sourceLabel(row)}
                {row.account_id && row.video_id ? <div className="text-xs font-normal text-muted-foreground">
                  账号 ID：{row.account_id}</div> : null}
              </TableCell>
              <TableCell>{sourceBadge(row.basis)}</TableCell>
              {(["entries", "visitors", "page_views", "lead_clicks", "appointments"] as const)
                .map((key) => <TableCell key={key} className="text-right tabular-nums">
                  {number(row[key])}</TableCell>)}
              <TableCell className="text-right tabular-nums">{efficiency(row.entries, row.appointments)}</TableCell>
            </TableRow>)}</TableBody>
          </Table> : <div className="py-10 text-center text-sm text-muted-foreground">
            暂无新版入口数据。请从已配置的抖音内容入口打开小程序后再查看。
          </div>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>共 {number(data.sources.pagination.total)} 个来源 · 第 {filters.page} 页</span>
            <div className="flex gap-2">
              {filters.page > 1 ? <FilterLink selected={false}
                href={buildTrafficHref({ ...filters, page: filters.page - 1 })}>上一页</FilterLink> : null}
              {filters.page < data.sources.pagination.totalPages ? <FilterLink selected={false}
                href={buildTrafficHref({ ...filters, page: filters.page + 1 })}>下一页</FilterLink> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </> : null}
  </main>;
}
