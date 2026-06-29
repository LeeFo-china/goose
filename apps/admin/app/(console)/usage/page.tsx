import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  UsageFilters,
  UsagePagination,
  type UsageTab,
} from "@/components/usage/usage-list-actions";
import { buildUsageHref } from "@/components/usage/usage-list-navigation";
import {
  UsageAiLogsTable,
  UsageSmsLogsTable,
  UsageSocialVideoLogsTable,
} from "@/components/usage/usage-logs-tables";
import { UsageSummaryCards } from "@/components/usage/usage-summary-cards";
import type {
  TenantUsageSummaryData,
  UsageAiLogRecord,
  UsageLogListData,
  UsageSmsLogRecord,
  UsageSocialVideoLogRecord,
} from "@/components/usage/usage-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSession } from "@/lib/auth";
import { isPlatformOnlySession } from "@/lib/session-mode";
import {
  buildQuery,
  defaultDateFrom,
  defaultDateTo,
  emptyLogList,
  emptySummary,
  fetchBackend,
  type TenantUsageSearchParams,
  readPositiveInteger,
  readStatus,
  readTab,
} from "./page-data";

const TENANT_USAGE_TABS: ReadonlyArray<{ value: UsageTab; label: string }> = [
  { value: "summary", label: "用量概览" },
  { value: "ai", label: "AI 明细" },
  { value: "sms", label: "短信明细" },
  { value: "social_video", label: "短视频明细" },
];

export default async function TenantUsagePage({
  searchParams,
}: {
  searchParams: TenantUsageSearchParams;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  if (isPlatformOnlySession(session)) {
    redirect("/platform/usage");
  }

  const params = await searchParams;
  const tab = readTab(params.tab);
  const aiPage = readPositiveInteger(params.aiPage, 1);
  const smsPage = readPositiveInteger(params.smsPage, 1);
  const socialVideoPage = readPositiveInteger(params.socialVideoPage, 1);
  const dateFrom = (params.date_from || defaultDateFrom()).slice(0, 10);
  const dateTo = (params.date_to || defaultDateTo()).slice(0, 10);
  const aiStatus = readStatus(params.ai_status, ["success", "failure"]);
  const smsStatus = readStatus(params.sms_status, ["success", "failure", "mock", "disabled"]);
  const socialVideoStatus = readStatus(params.social_video_status, [
    "pending",
    "resolving",
    "downloading",
    "extracting_audio",
    "creating_asr_task",
    "transcribing",
    "completed",
    "failed",
  ]);
  const socialVideoBillable = readStatus(params.social_video_billable, ["true", "false"]);

  const summaryQuery = buildQuery({
    date_from: dateFrom,
    date_to: dateTo,
  });
  const summaryResult = await fetchBackend<TenantUsageSummaryData>(
    `/usage/summary?${summaryQuery}`,
    emptySummary(dateFrom, dateTo),
  );
  const aiQuery = buildQuery({
    page: aiPage,
    pageSize: 20,
    status: aiStatus === "__all" ? undefined : aiStatus,
    date_from: dateFrom,
    date_to: dateTo,
  });
  const smsQuery = buildQuery({
    page: smsPage,
    pageSize: 20,
    status: smsStatus === "__all" ? undefined : smsStatus,
    date_from: dateFrom,
    date_to: dateTo,
  });
  const socialVideoQuery = buildQuery({
    page: socialVideoPage,
    pageSize: 20,
    status: socialVideoStatus === "__all" ? undefined : socialVideoStatus,
    billable: socialVideoBillable === "__all" ? undefined : socialVideoBillable,
    date_from: dateFrom,
    date_to: dateTo,
  });
  const aiResult = tab === "ai"
    ? await fetchBackend<UsageLogListData<UsageAiLogRecord>>(
      `/usage/ai-logs?${aiQuery}`,
      emptyLogList<UsageAiLogRecord>(aiPage),
    )
    : { data: emptyLogList<UsageAiLogRecord>(aiPage), error: null };
  const smsResult = tab === "sms"
    ? await fetchBackend<UsageLogListData<UsageSmsLogRecord>>(
      `/usage/sms-logs?${smsQuery}`,
      emptyLogList<UsageSmsLogRecord>(smsPage),
    )
    : { data: emptyLogList<UsageSmsLogRecord>(smsPage), error: null };
  const socialVideoResult = tab === "social_video"
    ? await fetchBackend<UsageLogListData<UsageSocialVideoLogRecord>>(
      `/usage/social-video-logs?${socialVideoQuery}`,
      emptyLogList<UsageSocialVideoLogRecord>(socialVideoPage),
    )
    : { data: emptyLogList<UsageSocialVideoLogRecord>(socialVideoPage), error: null };
  const buildTabHref = (nextTab: UsageTab) => buildUsageHref({
    basePath: "/usage",
    tab: nextTab,
    dateFrom,
    dateTo,
    aiStatus,
    smsStatus,
    socialVideoStatus,
    socialVideoBillable,
  });
  const activePagination = tab === "ai"
    ? aiResult.data.pagination
    : tab === "sms"
      ? smsResult.data.pagination
      : socialVideoResult.data.pagination;
  const activePageKey = tab === "ai"
    ? "aiPage"
    : tab === "sms"
      ? "smsPage"
      : "socialVideoPage";
  const activeUnit = tab === "ai"
    ? "条 AI 明细"
    : tab === "sms"
      ? "条短信明细"
      : "条短视频明细";

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-normal">用量统计</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            本租户用量仅包含本公司的 AI、短信和短视频转写记录。
          </p>
        </div>
        <Badge variant="outline">{dateFrom} 至 {dateTo}</Badge>
      </div>

      {summaryResult.error ? <StatusAlert>{summaryResult.error}</StatusAlert> : null}
      {aiResult.error ? <StatusAlert>{aiResult.error}</StatusAlert> : null}
      {smsResult.error ? <StatusAlert>{smsResult.error}</StatusAlert> : null}
      {socialVideoResult.error ? <StatusAlert>{socialVideoResult.error}</StatusAlert> : null}

      <Tabs value={tab} className="contents">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
          <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
            <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden">
              {TENANT_USAGE_TABS.map((usageTab) => (
                <TabsTrigger
                  key={usageTab.value}
                  value={usageTab.value}
                  asChild
                  className="shrink-0"
                >
                  <Link href={buildTabHref(usageTab.value)}>{usageTab.label}</Link>
                </TabsTrigger>
              ))}
            </TabsList>
            {tab === "summary" ? <UsageSummaryCards data={summaryResult.data} /> : null}
            <UsageFilters
              basePath="/usage"
              tab={tab}
              dateFrom={dateFrom}
              dateTo={dateTo}
              aiStatus={aiStatus}
              smsStatus={smsStatus}
              socialVideoStatus={socialVideoStatus}
              socialVideoBillable={socialVideoBillable}
            />
          </CardHeader>
          <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
            <div
              data-testid="tenant-usage-list-table-viewport"
              className="min-h-0 flex-1 overflow-auto"
            >
              <TabsContent value="summary" className="m-0 min-h-full">
                <TenantUsageOverview data={summaryResult.data} />
              </TabsContent>
              <TabsContent value="ai" className="m-0 min-h-full">
                <UsageAiLogsTable logs={aiResult.data.list} />
              </TabsContent>
              <TabsContent value="sms" className="m-0 min-h-full">
                <UsageSmsLogsTable logs={smsResult.data.list} />
              </TabsContent>
              <TabsContent value="social_video" className="m-0 min-h-full">
                <UsageSocialVideoLogsTable logs={socialVideoResult.data.list} />
              </TabsContent>
            </div>
            {tab === "summary" ? null : (
              <div className="shrink-0 border-t bg-card px-4 py-3">
                <UsagePagination
                  basePath="/usage"
                  pagination={activePagination}
                  pageKey={activePageKey}
                  tab={tab}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  aiStatus={aiStatus}
                  smsStatus={smsStatus}
                  socialVideoStatus={socialVideoStatus}
                  socialVideoBillable={socialVideoBillable}
                  unit={activeUnit}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}

function TenantUsageOverview({ data }: { data: TenantUsageSummaryData }) {
  const aiSuccessRate = data.ai.call_count > 0
    ? `${Math.round((data.ai.success_count / data.ai.call_count) * 100)}%`
    : "-";
  const smsSuccessRate = data.sms.send_count > 0
    ? `${Math.round((data.sms.success_count / data.sms.send_count) * 100)}%`
    : "-";

  return (
    <div className="grid gap-0 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5">
      <TenantUsageMetric label="AI 成功率" value={aiSuccessRate} />
      <TenantUsageMetric label="短信成功率" value={smsSuccessRate} />
      <TenantUsageMetric label="AI token 缺失" value={data.ai.missing_token_count} />
      <TenantUsageMetric label="短视频计费分钟" value={data.social_video.billable_minutes} />
      <TenantUsageMetric label="短视频时长缺失" value={data.social_video.missing_duration_count} />
    </div>
  );
}

function TenantUsageMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <section className="min-w-0 p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </section>
  );
}
