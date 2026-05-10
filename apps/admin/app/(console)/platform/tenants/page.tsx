import { redirect } from "next/navigation";
import { CreatePlatformTenantButton } from "@/components/platform-tenants/platform-tenant-mutations";
import {
  PlatformTenantFilters,
  PlatformTenantPagination,
} from "@/components/platform-tenants/platform-tenant-list-actions";
import { PlatformTenantsTable } from "@/components/platform-tenants/platform-tenants-table";
import {
  getPlatformTenantStatusMeta,
  type PlatformTenantListData,
  type PlatformTenantRecord,
  type PlatformTenantStatus,
} from "@/components/platform-tenants/platform-tenant-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const TENANT_STATUSES = ["active", "suspended", "archived"] as const;

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
  return TENANT_STATUSES.includes(value as PlatformTenantStatus) ? value as PlatformTenantStatus : "";
}

function buildTenantQuery(params: {
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

async function getPlatformTenants(input: {
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
    const response = await fetch(buildBackendUrl(`/platform/tenants?${buildTenantQuery(input)}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<PlatformTenantListData>(response);
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
      error: error instanceof Error ? error.message : "平台租户列表加载失败",
    };
  }
}

function summarizeCurrentPage(list: PlatformTenantRecord[]) {
  return {
    active: list.filter((item) => item.status === "active").length,
    suspended: list.filter((item) => item.status === "suspended").length,
    archived: list.filter((item) => item.status === "archived").length,
    employees: list.reduce((sum, item) => sum + (item.usage?.employee_count || 0), 0),
    projects: list.reduce((sum, item) => sum + (item.usage?.project_count || 0), 0),
  };
}

export default async function PlatformTenantsPage({
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
    ? await getPlatformTenants({ page, status, keyword })
    : {
      list: [],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: "当前账号不是平台超管，无法访问租户管理",
    };
  const summary = summarizeCurrentPage(list);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">平台租户</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理入驻装修公司、初始化管理员账号，并查看租户基础用量。
          </p>
        </div>
        {hasPlatformAccess ? <CreatePlatformTenantButton /> : null}
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <div className="grid gap-3 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>租户总数</CardDescription>
            <CardTitle>{pagination.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页正常</CardDescription>
            <CardTitle>{summary.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页停用</CardDescription>
            <CardTitle>{summary.suspended}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页员工</CardDescription>
            <CardTitle>{summary.employees}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页项目</CardDescription>
            <CardTitle>{summary.projects}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>租户列表</CardTitle>
              <CardDescription>
                当前筛选：
                {status ? <Badge variant={getPlatformTenantStatusMeta(status).variant}>{getPlatformTenantStatusMeta(status).label}</Badge> : <Badge variant="outline">全部状态</Badge>}
              </CardDescription>
            </div>
            <Badge variant="outline">共 {pagination.total} 个</Badge>
          </div>
          <PlatformTenantFilters status={status} keyword={keyword} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          <PlatformTenantsTable tenants={list} />
          <div className="px-4 pb-4">
            <PlatformTenantPagination
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
