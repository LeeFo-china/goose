import { redirect } from "next/navigation";
import { StatusAlert } from "@/components/admin/status-alert";
import { PlatformUsageTable } from "@/components/usage/platform-usage-table";
import {
  UsageFilters,
  UsagePagination,
  UsageTabsNav,
  type UsageTab,
} from "@/components/usage/usage-list-actions";
import {
  UsageAiLogsTable,
  UsageSmsLogsTable,
  UsageSocialVideoLogsTable,
} from "@/components/usage/usage-logs-tables";
import { UsageSummaryCards } from "@/components/usage/usage-summary-cards";
import type {
  PlatformTenantUsageData,
  UsageAiLogRecord,
  UsageLogListData,
  UsageSmsLogRecord,
  UsageSocialVideoLogRecord,
} from "@/components/usage/usage-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";
import {
  buildQuery,
  defaultDateFrom,
  defaultDateTo,
  emptyLogList,
  emptyPlatformUsage,
  fetchBackend,
  type PlatformUsageSearchParams,
  readPositiveInteger,
  readStatus,
  readTab,
  summarizePage,
} from "./page-data";

export default async function PlatformUsagePage({
  searchParams,
}: {
  searchParams: PlatformUsageSearchParams;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  const hasPlatformAccess = session.roles.includes("platform_admin");
  const params = await searchParams;
  const tab = readTab(params.tab);
  const page = readPositiveInteger(params.page, 1);
  const aiPage = readPositiveInteger(params.aiPage, 1);
  const smsPage = readPositiveInteger(params.smsPage, 1);
  const socialVideoPage = readPositiveInteger(params.socialVideoPage, 1);
  const dateFrom = (params.date_from || defaultDateFrom()).slice(0, 10);
  const dateTo = (params.date_to || defaultDateTo()).slice(0, 10);
  const keyword = (params.keyword || "").trim().slice(0, 80);
  const tenantId = (params.tenant_id || "").trim();
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

  const usageQuery = buildQuery({
    page,
    pageSize: 20,
    keyword,
    date_from: dateFrom,
    date_to: dateTo,
  });
  const usageResult = hasPlatformAccess
    ? await fetchBackend<PlatformTenantUsageData>(
      `/platform/usage/tenants?${usageQuery}`,
      emptyPlatformUsage({ page, dateFrom, dateTo }),
    )
    : {
      data: emptyPlatformUsage({ page, dateFrom, dateTo }),
      error: "当前账号不是平台超管，无法访问平台用量统计",
    };
  const summary = summarizePage(usageResult.data);

  const aiQuery = buildQuery({
    page: aiPage,
    pageSize: 20,
    tenant_id: tenantId,
    status: aiStatus === "__all" ? undefined : aiStatus,
    date_from: dateFrom,
    date_to: dateTo,
  });
  const smsQuery = buildQuery({
    page: smsPage,
    pageSize: 20,
    tenant_id: tenantId,
    status: smsStatus === "__all" ? undefined : smsStatus,
    date_from: dateFrom,
    date_to: dateTo,
  });
  const socialVideoQuery = buildQuery({
    page: socialVideoPage,
    pageSize: 20,
    tenant_id: tenantId,
    status: socialVideoStatus === "__all" ? undefined : socialVideoStatus,
    billable: socialVideoBillable === "__all" ? undefined : socialVideoBillable,
    date_from: dateFrom,
    date_to: dateTo,
  });
  const aiResult = tab === "ai" && hasPlatformAccess
    ? await fetchBackend<UsageLogListData<UsageAiLogRecord>>(
      `/platform/usage/ai-logs?${aiQuery}`,
      emptyLogList<UsageAiLogRecord>(aiPage),
    )
    : { data: emptyLogList<UsageAiLogRecord>(aiPage), error: null };
  const smsResult = tab === "sms" && hasPlatformAccess
    ? await fetchBackend<UsageLogListData<UsageSmsLogRecord>>(
      `/platform/usage/sms-logs?${smsQuery}`,
      emptyLogList<UsageSmsLogRecord>(smsPage),
    )
    : { data: emptyLogList<UsageSmsLogRecord>(smsPage), error: null };
  const socialVideoResult = tab === "social_video" && hasPlatformAccess
    ? await fetchBackend<UsageLogListData<UsageSocialVideoLogRecord>>(
      `/platform/usage/social-video-logs?${socialVideoQuery}`,
      emptyLogList<UsageSocialVideoLogRecord>(socialVideoPage),
    )
    : { data: emptyLogList<UsageSocialVideoLogRecord>(socialVideoPage), error: null };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">用量统计</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看租户 AI token、短信发送量、短视频转写分钟和失败明细，用于成本核算和异常排查。
          </p>
        </div>
        <Badge variant="outline">{dateFrom} 至 {dateTo}</Badge>
      </div>

      {usageResult.error ? <StatusAlert>{usageResult.error}</StatusAlert> : null}
      {aiResult.error ? <StatusAlert>{aiResult.error}</StatusAlert> : null}
      {smsResult.error ? <StatusAlert>{smsResult.error}</StatusAlert> : null}
      {socialVideoResult.error ? <StatusAlert>{socialVideoResult.error}</StatusAlert> : null}

      <UsageSummaryCards data={summary} />

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>平台用量</CardTitle>
              <CardDescription>
                当前页合计。平台全量成本结算后续可由日汇总任务生成。
              </CardDescription>
            </div>
            <UsageTabsNav
              basePath="/platform/usage"
              tab={tab}
              dateFrom={dateFrom}
              dateTo={dateTo}
              keyword={keyword}
              tenantId={tenantId}
              aiStatus={aiStatus}
              smsStatus={smsStatus}
              socialVideoStatus={socialVideoStatus}
              socialVideoBillable={socialVideoBillable}
            />
          </div>
          <UsageFilters
            basePath="/platform/usage"
            tab={tab}
            dateFrom={dateFrom}
            dateTo={dateTo}
            keyword={keyword}
            tenantId={tenantId}
            aiStatus={aiStatus}
            smsStatus={smsStatus}
            socialVideoStatus={socialVideoStatus}
            socialVideoBillable={socialVideoBillable}
            showKeyword={tab === "summary"}
            showTenantId={tab !== "summary"}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          {tab === "summary" ? (
            <>
              <PlatformUsageTable
                list={usageResult.data.list}
                dateFrom={dateFrom}
                dateTo={dateTo}
              />
              <div className="px-4 pb-4">
                <UsagePagination
                  basePath="/platform/usage"
                  pagination={usageResult.data.pagination}
                  pageKey="page"
                  tab={tab}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  keyword={keyword}
                  tenantId={tenantId}
                  aiStatus={aiStatus}
                  smsStatus={smsStatus}
                  socialVideoStatus={socialVideoStatus}
                  socialVideoBillable={socialVideoBillable}
                  unit="个租户"
                />
              </div>
            </>
          ) : tab === "ai" ? (
            <>
              <UsageAiLogsTable logs={aiResult.data.list} />
              <div className="px-4 pb-4">
                <UsagePagination
                  basePath="/platform/usage"
                  pagination={aiResult.data.pagination}
                  pageKey="aiPage"
                  tab={tab}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  tenantId={tenantId}
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
                  basePath="/platform/usage"
                  pagination={smsResult.data.pagination}
                  pageKey="smsPage"
                  tab={tab}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  tenantId={tenantId}
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
                  basePath="/platform/usage"
                  pagination={socialVideoResult.data.pagination}
                  pageKey="socialVideoPage"
                  tab={tab}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  tenantId={tenantId}
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
