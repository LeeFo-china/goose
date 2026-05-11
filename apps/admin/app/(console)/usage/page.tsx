import { redirect } from "next/navigation";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  UsageFilters,
  UsagePagination,
  UsageTabsNav,
  type UsageTab,
} from "@/components/usage/usage-list-actions";
import { UsageAiLogsTable, UsageSmsLogsTable } from "@/components/usage/usage-logs-tables";
import { UsageSummaryCards } from "@/components/usage/usage-summary-cards";
import type {
  TenantUsageSummaryData,
  UsageAiLogRecord,
  UsageLogListData,
  UsageSmsLogRecord,
} from "@/components/usage/usage-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

type SearchParams = Promise<{
  tab?: string;
  aiPage?: string;
  smsPage?: string;
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

function emptySummary(dateFrom: string, dateTo: string): TenantUsageSummaryData {
  return {
    range: { date_from: dateFrom, date_to: dateTo },
    tenant: { id: "", name: "当前租户", slug: "" },
    ai: {
      call_count: 0,
      success_count: 0,
      failure_count: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      missing_token_count: 0,
    },
    sms: {
      send_count: 0,
      success_count: 0,
      failure_count: 0,
      mock_count: 0,
      disabled_count: 0,
    },
  };
}

function emptyLogList<T>(page: number): UsageLogListData<T> {
  return {
    list: [],
    pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
  };
}

export default async function TenantUsagePage({
  searchParams,
}: {
  searchParams: SearchParams;
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
  const dateFrom = (params.date_from || defaultDateFrom()).slice(0, 10);
  const dateTo = (params.date_to || defaultDateTo()).slice(0, 10);
  const aiStatus = readStatus(params.ai_status, ["success", "failure"]);
  const smsStatus = readStatus(params.sms_status, ["success", "failure", "mock", "disabled"]);

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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">用量统计</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看本公司 AI token、短信发送量和失败明细。
          </p>
        </div>
        <Badge variant="outline">{dateFrom} 至 {dateTo}</Badge>
      </div>

      {summaryResult.error ? <StatusAlert>{summaryResult.error}</StatusAlert> : null}
      {aiResult.error ? <StatusAlert>{aiResult.error}</StatusAlert> : null}
      {smsResult.error ? <StatusAlert>{smsResult.error}</StatusAlert> : null}

      <UsageSummaryCards data={summaryResult.data} />

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>本租户用量</CardTitle>
              <CardDescription>
                租户只能查看本公司的 AI 和短信用量，手机号仅展示脱敏值。
              </CardDescription>
            </div>
            <UsageTabsNav
              basePath="/usage"
              tab={tab}
              dateFrom={dateFrom}
              dateTo={dateTo}
              aiStatus={aiStatus}
              smsStatus={smsStatus}
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
                  unit="条 AI 明细"
                />
              </div>
            </>
          ) : (
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
