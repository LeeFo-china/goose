import { redirect } from "next/navigation";
import { type ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  UsageFilters,
  UsagePagination,
  UsageTabsNav,
} from "@/components/usage/usage-list-actions";
import {
  UsageAiLogsTable,
  UsageSmsLogsTable,
  UsageSocialVideoLogsTable,
} from "@/components/usage/usage-logs-tables";
import { UsageOverviewPanel } from "@/components/usage/usage-overview-panel";
import type {
  TenantUsageSummaryData,
  UsageAiLogRecord,
  UsageLogListData,
  UsageSmsLogRecord,
  UsageSocialVideoLogRecord,
} from "@/components/usage/usage-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  const errors = [
    summaryResult.error,
    aiResult.error,
    smsResult.error,
    socialVideoResult.error,
  ].filter((message): message is string => Boolean(message));

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <BarChart3 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-normal">用量统计</h1>
              <Badge variant="outline">{dateFrom} 至 {dateTo}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              本公司 AI token、短信发送量、短视频转写分钟和失败明细。
            </p>
          </div>
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="shrink-0 space-y-2">
          {errors.map((message, index) => (
            <StatusAlert key={`${index}-${message}`}>{message}</StatusAlert>
          ))}
        </div>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-card px-4 py-0">
          <div className="flex overflow-x-auto">
            <UsageTabsNav
              basePath="/usage"
              tab={tab}
              dateFrom={dateFrom}
              dateTo={dateTo}
              aiStatus={aiStatus}
              smsStatus={smsStatus}
              socialVideoStatus={socialVideoStatus}
              socialVideoBillable={socialVideoBillable}
              summaryLabel="用量概览"
              tabsListClassName="h-auto min-w-max justify-start gap-5 overflow-x-auto overflow-y-hidden rounded-none border-0 bg-transparent p-0"
              tabsTriggerClassName="rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-2 text-sm text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
            />
          </div>
          <div className="pb-3">
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
          </div>
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          {tab === "summary" ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <UsageOverviewPanel data={summaryResult.data} />
            </div>
          ) : tab === "ai" ? (
            <UsageLogPanel
              pagination={
                <UsagePagination
                  basePath="/usage"
                  pagination={aiResult.data.pagination}
                  pageKey="aiPage"
                  tab={tab}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  aiStatus={aiStatus}
                  smsStatus={smsStatus}
                  socialVideoStatus={socialVideoStatus}
                  socialVideoBillable={socialVideoBillable}
                  unit="条 AI 明细"
                />
              }
            >
              <UsageAiLogsTable logs={aiResult.data.list} />
            </UsageLogPanel>
          ) : tab === "sms" ? (
            <UsageLogPanel
              pagination={
                <UsagePagination
                  basePath="/usage"
                  pagination={smsResult.data.pagination}
                  pageKey="smsPage"
                  tab={tab}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  aiStatus={aiStatus}
                  smsStatus={smsStatus}
                  socialVideoStatus={socialVideoStatus}
                  socialVideoBillable={socialVideoBillable}
                  unit="条短信明细"
                />
              }
            >
              <UsageSmsLogsTable logs={smsResult.data.list} />
            </UsageLogPanel>
          ) : (
            <UsageLogPanel
              pagination={
                <UsagePagination
                  basePath="/usage"
                  pagination={socialVideoResult.data.pagination}
                  pageKey="socialVideoPage"
                  tab={tab}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  aiStatus={aiStatus}
                  smsStatus={smsStatus}
                  socialVideoStatus={socialVideoStatus}
                  socialVideoBillable={socialVideoBillable}
                  unit="条短视频明细"
                />
              }
            >
              <UsageSocialVideoLogsTable logs={socialVideoResult.data.list} />
            </UsageLogPanel>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageLogPanel({
  children,
  pagination,
}: {
  children: ReactNode;
  pagination: ReactNode;
}) {
  return (
    <>
      <div
        data-testid="tenant-usage-list-table-viewport"
        className="min-h-0 flex-1 overflow-auto"
      >
        {children}
      </div>
      <div className="shrink-0 border-t bg-card px-4 py-3">
        {pagination}
      </div>
    </>
  );
}
