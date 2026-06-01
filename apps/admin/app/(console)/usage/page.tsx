import { redirect } from "next/navigation";
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
import { UsageSummaryCards } from "@/components/usage/usage-summary-cards";
import type {
  TenantUsageSummaryData,
  UsageAiLogRecord,
  UsageLogListData,
  UsageSmsLogRecord,
  UsageSocialVideoLogRecord,
} from "@/components/usage/usage-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">用量统计</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看本公司 AI token、短信发送量、短视频转写分钟和失败明细。
          </p>
        </div>
        <Badge variant="outline">{dateFrom} 至 {dateTo}</Badge>
      </div>

      {summaryResult.error ? <StatusAlert>{summaryResult.error}</StatusAlert> : null}
      {aiResult.error ? <StatusAlert>{aiResult.error}</StatusAlert> : null}
      {smsResult.error ? <StatusAlert>{smsResult.error}</StatusAlert> : null}
      {socialVideoResult.error ? <StatusAlert>{socialVideoResult.error}</StatusAlert> : null}

      <UsageSummaryCards data={summaryResult.data} />

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>本租户用量</CardTitle>
              <CardDescription>
                租户只能查看本公司的 AI、短信和短视频转写用量，手机号仅展示脱敏值。
              </CardDescription>
            </div>
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
            />
          </div>
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
        <CardContent className="flex flex-col gap-4 p-0">
          {tab === "summary" ? (
            <div className="grid gap-3 p-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardDescription>AI 成功率</CardDescription>
                  <CardTitle>
                    {summaryResult.data.ai.call_count > 0
                      ? `${Math.round((summaryResult.data.ai.success_count / summaryResult.data.ai.call_count) * 100)}%`
                      : "-"}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>短信成功率</CardDescription>
                  <CardTitle>
                    {summaryResult.data.sms.send_count > 0
                      ? `${Math.round((summaryResult.data.sms.success_count / summaryResult.data.sms.send_count) * 100)}%`
                      : "-"}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>AI token 缺失</CardDescription>
                  <CardTitle>{summaryResult.data.ai.missing_token_count}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>短视频计费分钟</CardDescription>
                  <CardTitle>{summaryResult.data.social_video.billable_minutes}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>短视频时长缺失</CardDescription>
                  <CardTitle>{summaryResult.data.social_video.missing_duration_count}</CardTitle>
                </CardHeader>
              </Card>
            </div>
          ) : tab === "ai" ? (
            <>
              <UsageAiLogsTable logs={aiResult.data.list} />
              <div className="px-4 pb-4">
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
              </div>
            </>
          ) : tab === "sms" ? (
            <>
              <UsageSmsLogsTable logs={smsResult.data.list} />
              <div className="px-4 pb-4">
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
              </div>
            </>
          ) : (
            <>
              <UsageSocialVideoLogsTable logs={socialVideoResult.data.list} />
              <div className="px-4 pb-4">
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
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
