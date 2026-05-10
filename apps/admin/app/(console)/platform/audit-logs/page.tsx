import { redirect } from "next/navigation";
import {
  PlatformAuditLogFilters,
  PlatformAuditLogPagination,
} from "@/components/platform-audit-logs/platform-audit-log-list-actions";
import { PlatformAuditLogsTable } from "@/components/platform-audit-logs/platform-audit-logs-table";
import {
  getPlatformAuditLogActionLabel,
  getPlatformAuditLogActionVariant,
  platformAuditLogActionOptions,
  type PlatformAuditLogAction,
  type PlatformAuditLogListData,
  type PlatformAuditLogRecord,
} from "@/components/platform-audit-logs/platform-audit-log-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const AUDIT_ACTIONS = platformAuditLogActionOptions.map((item) => item.value);

type SearchParams = Promise<{
  page?: string;
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
  action: string;
  keyword: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("pageSize", "20");
  if (params.action) query.set("action", params.action);
  if (params.keyword) query.set("keyword", params.keyword);
  return query.toString();
}

async function getPlatformAuditLogs(input: {
  page: number;
  action: string;
  keyword: string;
}) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page: input.page, pageSize: 20, total: 0, totalPages: 0 },
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
        pagination: { page: input.page, pageSize: 20, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page: input.page, pageSize: 20, total: 0, totalPages: 0 },
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
  const action = readAction(params.action);
  const keyword = (params.keyword || "").trim().slice(0, 80);
  const { list, pagination, error } = hasPlatformAccess
    ? await getPlatformAuditLogs({ page, action, keyword })
    : {
      list: [],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: "当前账号不是平台超管，无法访问平台审计",
    };
  const summary = summarizeCurrentPage(list);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">平台审计</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          追踪平台超管对租户、管理员和平台线索的关键操作。
        </p>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <div className="grid gap-3 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>审计总数</CardDescription>
            <CardTitle>{pagination.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页租户操作</CardDescription>
            <CardTitle>{summary.tenant}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页管理员操作</CardDescription>
            <CardTitle>{summary.employee}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页线索操作</CardDescription>
            <CardTitle>{summary.lead}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页成功</CardDescription>
            <CardTitle>{summary.success}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>审计记录</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                当前筛选：
                {action ? (
                  <Badge variant={getPlatformAuditLogActionVariant(action)}>
                    {getPlatformAuditLogActionLabel(action)}
                  </Badge>
                ) : (
                  <Badge variant="outline">全部操作</Badge>
                )}
              </CardDescription>
            </div>
            <Badge variant="outline">共 {pagination.total} 条</Badge>
          </div>
          <PlatformAuditLogFilters action={action} keyword={keyword} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          <PlatformAuditLogsTable logs={list} />
          <div className="px-4 pb-4">
            <PlatformAuditLogPagination
              pagination={pagination}
              action={action}
              keyword={keyword}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
