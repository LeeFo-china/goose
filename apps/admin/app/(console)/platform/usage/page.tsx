import { redirect } from "next/navigation";
import { StatusAlert } from "@/components/admin/status-alert";
import { PlatformUsageTable } from "@/components/usage/platform-usage-table";
import {
  UsageFilters,
  UsagePagination,
  UsageTabsNav,
  type UsageTab,
} from "@/components/usage/usage-list-actions";
import { UsageAiLogsTable, UsageSmsLogsTable } from "@/components/usage/usage-logs-tables";
import { UsageSummaryCards } from "@/components/usage/usage-summary-cards";
import type {
  PlatformTenantUsageData,
  TenantUsageSummaryData,
  UsageAiLogRecord,
  UsageLogListData,
  UsageSmsLogRecord,
} from "@/components/usage/usage-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type SearchParams = Promise<{
  tab?: string;
  page?: string;
  aiPage?: string;
  smsPage?: string;
  keyword?: string;
  tenant_id?: string;
  ai_status?: string;
  sms_status?: string;
  date_from?: string;
  date_to?: string;
}>;

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readTab(value: string | undefined): UsageTab {
  return value === "ai" || value === "sms" ? value : "summary";
}

function readStatus(value: string | undefined, allowed: string[]) {
  return value && allowed.includes(value) ? value : "__all";
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultDateFrom() {
  const now = new Date();
  return toDateOnly(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

function defaultDateTo() {
  return toDateOnly(new Date());
}

function buildQuery(input: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

async function fetchBackend<T>(path: string, fallback: T) {
  const token = await getAdminToken();
  if (!token) {
    return { data: fallback, error: "缺少登录凭证" };
  }

  try {
    const response = await fetch(buildBackendUrl(path), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<T>(response);
    return { data: payload.data || fallback, error: null };
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error.message : "用量数据加载失败",
    };
  }
}

function emptyPlatformUsage(params: { page: number; dateFrom: string; dateTo: string }): PlatformTenantUsageData {
  return {
    range: { date_from: params.dateFrom, date_to: params.dateTo },
    list: [],
    pagination: { page: params.page, pageSize: 20, total: 0, totalPages: 0 },
  };
}

function emptyLogList<T>(page: number): UsageLogListData<T> {
  return {
    list: [],
    pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
  };
}

function summarizePage(data: PlatformTenantUsageData): TenantUsageSummaryData {
  return {
    range: data.range,
    tenant: { id: "platform", name: "当前页租户合计", slug: "platform" },
    ai: data.list.reduce((summary, item) => ({
      call_count: summary.call_count + item.ai.call_count,
      success_count: summary.success_count + item.ai.success_count,
      failure_count: summary.failure_count + item.ai.failure_count,
      prompt_tokens: summary.prompt_tokens + item.ai.prompt_tokens,
      completion_tokens: summary.completion_tokens + item.ai.completion_tokens,
      total_tokens: summary.total_tokens + item.ai.total_tokens,
      missing_token_count: summary.missing_token_count + item.ai.missing_token_count,
    }), {
      call_count: 0,
      success_count: 0,
      failure_count: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      missing_token_count: 0,
    }),
    sms: data.list.reduce((summary, item) => ({
      send_count: summary.send_count + item.sms.send_count,
      success_count: summary.success_count + item.sms.success_count,
      failure_count: summary.failure_count + item.sms.failure_count,
      mock_count: summary.mock_count + item.sms.mock_count,
      disabled_count: summary.disabled_count + item.sms.disabled_count,
    }), {
      send_count: 0,
      success_count: 0,
      failure_count: 0,
      mock_count: 0,
      disabled_count: 0,
    }),
  };
}

export default async function PlatformUsagePage({
  searchParams,
}: {
  searchParams: SearchParams;
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
  const dateFrom = (params.date_from || defaultDateFrom()).slice(0, 10);
  const dateTo = (params.date_to || defaultDateTo()).slice(0, 10);
  const keyword = (params.keyword || "").trim().slice(0, 80);
  const tenantId = (params.tenant_id || "").trim();
  const aiStatus = readStatus(params.ai_status, ["success", "failure"]);
  const smsStatus = readStatus(params.sms_status, ["success", "failure", "mock", "disabled"]);

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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">用量统计</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看租户 AI token、短信发送量和失败明细，用于成本核算和异常排查。
          </p>
        </div>
        <Badge variant="outline">{dateFrom} 至 {dateTo}</Badge>
      </div>

      {usageResult.error ? <StatusAlert>{usageResult.error}</StatusAlert> : null}
      {aiResult.error ? <StatusAlert>{aiResult.error}</StatusAlert> : null}
      {smsResult.error ? <StatusAlert>{smsResult.error}</StatusAlert> : null}

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
                  unit="条 AI 明细"
                />
              </div>
            </>
          ) : (
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
                  unit="条短信明细"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
