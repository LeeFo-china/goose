import { redirect } from "next/navigation";
import {
  PlatformLeadFilters,
  PlatformLeadPagination,
} from "@/components/platform-leads/platform-lead-list-actions";
import { PlatformLeadsTable } from "@/components/platform-leads/platform-leads-table";
import {
  getPlatformLeadStatusMeta,
  type PlatformLeadListData,
  type PlatformLeadRecord,
  type PlatformLeadStatus,
} from "@/components/platform-leads/platform-lead-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const LEAD_STATUSES = ["new", "assigned", "invalid"] as const;

type SearchParams = Promise<{
  page?: string;
  status?: string;
  keyword?: string;
}>;

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readStatus(value: string | undefined) {
  return LEAD_STATUSES.includes(value as PlatformLeadStatus) ? value as PlatformLeadStatus : "";
}

function buildLeadQuery(params: {
  page: number;
  status: string;
  keyword: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("pageSize", "20");
  if (params.status) query.set("status", params.status);
  if (params.keyword) query.set("keyword", params.keyword);
  return query.toString();
}

async function getPlatformLeads(input: {
  page: number;
  status: string;
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
    const response = await fetch(buildBackendUrl(`/platform/leads?${buildLeadQuery(input)}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<PlatformLeadListData>(response);
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
      error: error instanceof Error ? error.message : "平台线索列表加载失败",
    };
  }
}

function summarizeCurrentPage(list: PlatformLeadRecord[]) {
  return {
    newCount: list.filter((item) => item.status === "new").length,
    assigned: list.filter((item) => item.status === "assigned").length,
    invalid: list.filter((item) => item.status === "invalid").length,
    assignedWithCustomer: list.filter((item) => Boolean(item.assigned_customer_id)).length,
  };
}

export default async function PlatformLeadsPage({
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
  const status = readStatus(params.status);
  const keyword = (params.keyword || "").trim().slice(0, 80);
  const { list, pagination, error } = hasPlatformAccess
    ? await getPlatformLeads({ page, status, keyword })
    : {
      list: [],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: "当前账号不是平台超管，无法访问平台线索",
    };
  const summary = summarizeCurrentPage(list);
  const filterMeta = status ? getPlatformLeadStatusMeta(status) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">平台线索</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理平台访客装修需求，按手机号在目标租户内去重后手动分配。
        </p>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <div className="grid gap-3 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>线索总数</CardDescription>
            <CardTitle>{pagination.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页待分配</CardDescription>
            <CardTitle>{summary.newCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页已分配</CardDescription>
            <CardTitle>{summary.assigned}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页无效</CardDescription>
            <CardTitle>{summary.invalid}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页已关联客户</CardDescription>
            <CardTitle>{summary.assignedWithCustomer}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>线索列表</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                当前筛选：
                {filterMeta ? <Badge variant={filterMeta.variant}>{filterMeta.label}</Badge> : <Badge variant="outline">全部状态</Badge>}
              </CardDescription>
            </div>
            <Badge variant="outline">共 {pagination.total} 条</Badge>
          </div>
          <PlatformLeadFilters status={status} keyword={keyword} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          <PlatformLeadsTable leads={list} />
          <div className="px-4 pb-4">
            <PlatformLeadPagination
              pagination={pagination}
              status={status}
              keyword={keyword}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
