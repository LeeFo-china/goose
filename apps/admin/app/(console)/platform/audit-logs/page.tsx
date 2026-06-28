import { redirect } from "next/navigation";
import {
  PlatformAuditLogFilters,
} from "@/components/platform-audit-logs/platform-audit-log-list-actions";
import { PlatformAuditLogsTable } from "@/components/platform-audit-logs/platform-audit-logs-table";
import {
  platformAuditLogActionOptions,
  type PlatformAuditLogAction,
  type PlatformAuditLogListData,
  type PlatformAuditLogRecord,
} from "@/components/platform-audit-logs/platform-audit-log-types";
import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const AUDIT_ACTIONS = platformAuditLogActionOptions.map((item) => item.value);

type SearchParams = Promise<{
  page?: string;
  pageSize?: string;
  action?: string;
  keyword?: string;
}>;

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readAction(value: string | undefined) {
  return AUDIT_ACTIONS.includes(value as PlatformAuditLogAction)
    ? value as PlatformAuditLogAction
    : "";
}

function buildAuditQuery(params: {
  page: number;
  pageSize: number;
  action: string;
  keyword: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("pageSize", String(params.pageSize));
  if (params.action) query.set("action", params.action);
  if (params.keyword) query.set("keyword", params.keyword);
  return query.toString();
}

async function getPlatformAuditLogs(input: {
  page: number;
  pageSize: number;
  action: string;
  keyword: string;
}) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl(`/platform/audit-logs?${buildAuditQuery(input)}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<PlatformAuditLogListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "平台审计日志加载失败",
    };
  }
}

function summarizeCurrentPage(list: PlatformAuditLogRecord[]) {
  return {
    tenant: list.filter((item) => item.resource_type === "tenant").length,
    employee: list.filter((item) => item.resource_type === "employee").length,
    lead: list.filter((item) => item.resource_type === "platform_lead").length,
    success: list.filter((item) => item.status === "success").length,
  };
}

export default async function PlatformAuditLogsPage({
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
  const page = readPositiveInteger(params.page, 1);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const action = readAction(params.action);
  const keyword = (params.keyword || "").trim().slice(0, 80);
  const { list, pagination, error } = hasPlatformAccess
    ? await getPlatformAuditLogs({ page, pageSize, action, keyword })
    : {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "当前账号不是平台超管，无法访问平台审计",
    };
  const summary = summarizeCurrentPage(list);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <PlatformListPageShell
        title="平台审计"
        description="追踪平台超管对租户、管理员和平台线索的关键操作。"
        error={error}
        summary={
          <div className="grid gap-3 md:grid-cols-5">
            <Card key="total">
              <CardHeader className="pb-2">
                <CardDescription>审计总数</CardDescription>
                <CardTitle>{pagination.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="tenant">
              <CardHeader className="pb-2">
                <CardDescription>本页租户操作</CardDescription>
                <CardTitle>{summary.tenant}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="employee">
              <CardHeader className="pb-2">
                <CardDescription>本页管理员操作</CardDescription>
                <CardTitle>{summary.employee}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="lead">
              <CardHeader className="pb-2">
                <CardDescription>本页线索操作</CardDescription>
                <CardTitle>{summary.lead}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="success">
              <CardHeader className="pb-2">
                <CardDescription>本页成功</CardDescription>
                <CardTitle>{summary.success}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        }
        filters={<PlatformAuditLogFilters action={action} keyword={keyword} />}
        pagination={pagination}
        currentCount={list.length}
        tableViewportTestId="platform-audit-log-list-table-viewport"
        unit="条审计记录"
      >
        <PlatformAuditLogsTable logs={list} />
      </PlatformListPageShell>
    </div>
  );
}
