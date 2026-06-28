import Link from "next/link";
import { redirect } from "next/navigation";
import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { PlatformUsageTable } from "@/components/usage/platform-usage-table";
import {
  UsageFilters,
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
  PlatformTenantUsageData,
  UsageAiLogRecord,
  UsageLogListData,
  UsageSmsLogRecord,
  UsageSocialVideoLogRecord,
} from "@/components/usage/usage-types";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSession } from "@/lib/auth";
import {
  buildQuery,
  defaultDateFrom,
  defaultDateTo,
  emptyLogList,
  emptyPlatformUsage,
  fetchBackend,
  normalizePlatformListPageSize,
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
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const aiPage = readPositiveInteger(params.aiPage, 1);
  const aiPageSize = normalizePlatformListPageSize(params.aiPageSize);
  const smsPage = readPositiveInteger(params.smsPage, 1);
  const smsPageSize = normalizePlatformListPageSize(params.smsPageSize);
  const socialVideoPage = readPositiveInteger(params.socialVideoPage, 1);
  const socialVideoPageSize = normalizePlatformListPageSize(params.socialVideoPageSize);
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
    pageSize,
    keyword,
    date_from: dateFrom,
    date_to: dateTo,
  });
  const usageResult = hasPlatformAccess
    ? await fetchBackend<PlatformTenantUsageData>(
      `/platform/usage/tenants?${usageQuery}`,
      emptyPlatformUsage({ page, pageSize, dateFrom, dateTo }),
    )
    : {
      data: emptyPlatformUsage({ page, pageSize, dateFrom, dateTo }),
      error: "当前账号不是平台超管，无法访问平台用量统计",
    };
  const summary = summarizePage(usageResult.data);

  const aiQuery = buildQuery({
    page: aiPage,
    pageSize: aiPageSize,
    tenant_id: tenantId,
    status: aiStatus === "__all" ? undefined : aiStatus,
    date_from: dateFrom,
    date_to: dateTo,
  });
  const smsQuery = buildQuery({
    page: smsPage,
    pageSize: smsPageSize,
    tenant_id: tenantId,
    status: smsStatus === "__all" ? undefined : smsStatus,
    date_from: dateFrom,
    date_to: dateTo,
  });
  const socialVideoQuery = buildQuery({
    page: socialVideoPage,
    pageSize: socialVideoPageSize,
    tenant_id: tenantId,
    status: socialVideoStatus === "__all" ? undefined : socialVideoStatus,
    billable: socialVideoBillable === "__all" ? undefined : socialVideoBillable,
    date_from: dateFrom,
    date_to: dateTo,
  });
  const aiResult = tab === "ai" && hasPlatformAccess
    ? await fetchBackend<UsageLogListData<UsageAiLogRecord>>(
      `/platform/usage/ai-logs?${aiQuery}`,
      emptyLogList<UsageAiLogRecord>(aiPage, aiPageSize),
    )
    : { data: emptyLogList<UsageAiLogRecord>(aiPage, aiPageSize), error: null };
  const smsResult = tab === "sms" && hasPlatformAccess
    ? await fetchBackend<UsageLogListData<UsageSmsLogRecord>>(
      `/platform/usage/sms-logs?${smsQuery}`,
      emptyLogList<UsageSmsLogRecord>(smsPage, smsPageSize),
    )
    : { data: emptyLogList<UsageSmsLogRecord>(smsPage, smsPageSize), error: null };
  const socialVideoResult = tab === "social_video" && hasPlatformAccess
    ? await fetchBackend<UsageLogListData<UsageSocialVideoLogRecord>>(
      `/platform/usage/social-video-logs?${socialVideoQuery}`,
      emptyLogList<UsageSocialVideoLogRecord>(socialVideoPage, socialVideoPageSize),
    )
    : { data: emptyLogList<UsageSocialVideoLogRecord>(socialVideoPage, socialVideoPageSize), error: null };
  const activeError = usageResult.error || aiResult.error || smsResult.error || socialVideoResult.error;
  const activePagination = tab === "summary"
    ? usageResult.data.pagination
    : tab === "ai"
      ? aiResult.data.pagination
      : tab === "sms"
        ? smsResult.data.pagination
        : socialVideoResult.data.pagination;
  const activeCount = tab === "summary"
    ? usageResult.data.list.length
    : tab === "ai"
      ? aiResult.data.list.length
      : tab === "sms"
        ? smsResult.data.list.length
        : socialVideoResult.data.list.length;
  const pageKey = tab === "summary"
    ? "page"
    : tab === "ai"
      ? "aiPage"
      : tab === "sms"
        ? "smsPage"
        : "socialVideoPage";
  const pageSizeKey = tab === "summary"
    ? "pageSize"
    : tab === "ai"
      ? "aiPageSize"
      : tab === "sms"
        ? "smsPageSize"
        : "socialVideoPageSize";
  const unit = tab === "summary"
    ? "个租户"
    : tab === "ai"
      ? "条 AI 明细"
      : tab === "sms"
        ? "条短信明细"
        : "条短视频明细";

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <Tabs value={tab} className="contents">
        <PlatformListPageShell
          title="用量统计"
          description="查看租户 AI token、短信发送量、短视频转写分钟和失败明细，用于成本核算和异常排查。"
          titleMeta={<Badge variant="outline">{dateFrom} 至 {dateTo}</Badge>}
          error={activeError}
          summary={<UsageSummaryCards data={summary} />}
          tabs={
            <TabsList>
              <TabsTrigger value="summary" asChild>
                <Link href={buildUsageHref({
                  basePath: "/platform/usage",
                  tab: "summary",
                  pageSize,
                  dateFrom,
                  dateTo,
                  keyword,
                  tenantId,
                  aiStatus,
                  smsStatus,
                  socialVideoStatus,
                  socialVideoBillable,
                })}>租户汇总</Link>
              </TabsTrigger>
              <TabsTrigger value="ai" asChild>
                <Link href={buildUsageHref({
                  basePath: "/platform/usage",
                  tab: "ai",
                  aiPageSize,
                  dateFrom,
                  dateTo,
                  keyword,
                  tenantId,
                  aiStatus,
                  smsStatus,
                  socialVideoStatus,
                  socialVideoBillable,
                })}>AI 明细</Link>
              </TabsTrigger>
              <TabsTrigger value="sms" asChild>
                <Link href={buildUsageHref({
                  basePath: "/platform/usage",
                  tab: "sms",
                  smsPageSize,
                  dateFrom,
                  dateTo,
                  keyword,
                  tenantId,
                  aiStatus,
                  smsStatus,
                  socialVideoStatus,
                  socialVideoBillable,
                })}>短信明细</Link>
              </TabsTrigger>
              <TabsTrigger value="social_video" asChild>
                <Link href={buildUsageHref({
                  basePath: "/platform/usage",
                  tab: "social_video",
                  socialVideoPageSize,
                  dateFrom,
                  dateTo,
                  keyword,
                  tenantId,
                  aiStatus,
                  smsStatus,
                  socialVideoStatus,
                  socialVideoBillable,
                })}>短视频明细</Link>
              </TabsTrigger>
            </TabsList>
          }
          filters={
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
          }
          pagination={activePagination}
          currentCount={activeCount}
          pageKey={pageKey}
          pageSizeKey={pageSizeKey}
          tableViewportTestId="platform-usage-list-table-viewport"
          unit={unit}
        >
          {tab === "summary" ? (
            <PlatformUsageTable
              list={usageResult.data.list}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          ) : tab === "ai" ? (
            <UsageAiLogsTable logs={aiResult.data.list} />
          ) : tab === "sms" ? (
            <UsageSmsLogsTable logs={smsResult.data.list} />
          ) : (
            <UsageSocialVideoLogsTable logs={socialVideoResult.data.list} />
          )}
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}
