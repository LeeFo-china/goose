import Link from "next/link";
import { redirect } from "next/navigation";
import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { platformTabsListClassName, platformTabsTriggerClassName } from "@/components/platform/platform-tabs";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const USAGE_TABS: ReadonlyArray<{ value: UsageTab; label: string }> = [
  { value: "summary", label: "用量概览" },
  { value: "ai", label: "AI 明细" },
  { value: "sms", label: "短信明细" },
  { value: "social_video", label: "短视频明细" },
];

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
  const buildTabHref = (nextTab: UsageTab) => buildUsageHref({
    basePath: "/platform/usage",
    tab: nextTab,
    pageSize: nextTab === "summary" ? pageSize : undefined,
    aiPageSize: nextTab === "ai" ? aiPageSize : undefined,
    smsPageSize: nextTab === "sms" ? smsPageSize : undefined,
    socialVideoPageSize: nextTab === "social_video" ? socialVideoPageSize : undefined,
    dateFrom,
    dateTo,
    keyword,
    tenantId,
    aiStatus,
    smsStatus,
    socialVideoStatus,
    socialVideoBillable,
  });

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <Tabs value={tab} className="contents">
        <PlatformListPageShell
          title="用量统计"
          description="查看租户 AI token、短信发送量、短视频转写分钟和失败明细，用于成本核算和异常排查。"
          titleMeta={<Badge variant="outline">{dateFrom} 至 {dateTo}</Badge>}
          error={activeError}
          tabs={
            <TabsList className={platformTabsListClassName}>
              {USAGE_TABS.map((usageTab) => (
                <TabsTrigger
                  key={usageTab.value}
                  value={usageTab.value}
                  asChild
                  className={platformTabsTriggerClassName}
                >
                  <Link href={buildTabHref(usageTab.value)}>{usageTab.label}</Link>
                </TabsTrigger>
              ))}
            </TabsList>
          }
          listHeader={tab === "summary" ? <UsageSummaryCards data={summary} /> : null}
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
          <TabsContent value="summary" className="m-0 min-h-full">
            <PlatformUsageTable
              list={usageResult.data.list}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
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
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}
