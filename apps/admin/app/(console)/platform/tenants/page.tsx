import { redirect } from "next/navigation";
import { CreatePlatformTenantButton } from "@/components/platform-tenants/platform-tenant-mutations";
import {
  PlatformTenantFilters,
} from "@/components/platform-tenants/platform-tenant-list-actions";
import { PlatformTenantsTable } from "@/components/platform-tenants/platform-tenants-table";
import {
  getPlatformTenantStatusMeta,
  type PlatformTenantListData,
  type PlatformTenantRecord,
  type PlatformTenantStatus,
} from "@/components/platform-tenants/platform-tenant-types";
import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const TENANT_STATUSES = ["active", "suspended", "archived"] as const;

type SearchParams = Promise<{
  page?: string;
  pageSize?: string;
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
  pageSize: number;
  status: string;
  keyword: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("pageSize", String(params.pageSize));
  if (params.status) query.set("status", params.status);
  if (params.keyword) query.set("keyword", params.keyword);
  return query.toString();
}

async function getPlatformTenants(input: {
  page: number;
  pageSize: number;
  status: string;
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
        pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
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
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const status = readStatus(params.status);
  const keyword = (params.keyword || "").trim().slice(0, 80);
  const { list, pagination, error } = hasPlatformAccess
    ? await getPlatformTenants({ page, pageSize, status, keyword })
    : {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "当前账号不是平台超管，无法访问租户管理",
    };
  const summary = summarizeCurrentPage(list);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <PlatformListPageShell
        title="平台租户"
        description="管理入驻装修公司、初始化管理员账号，并查看租户基础用量。"
        action={hasPlatformAccess ? <CreatePlatformTenantButton /> : null}
        error={error}
        summary={
          <div className="grid gap-3 md:grid-cols-5">
            <Card key="total">
              <CardHeader className="pb-2">
                <CardDescription>租户总数</CardDescription>
                <CardTitle>{pagination.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="active">
              <CardHeader className="pb-2">
                <CardDescription>本页正常</CardDescription>
                <CardTitle>{summary.active}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="suspended">
              <CardHeader className="pb-2">
                <CardDescription>本页停用</CardDescription>
                <CardTitle>{summary.suspended}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="employees">
              <CardHeader className="pb-2">
                <CardDescription>本页员工</CardDescription>
                <CardTitle>{summary.employees}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="projects">
              <CardHeader className="pb-2">
                <CardDescription>本页项目</CardDescription>
                <CardTitle>{summary.projects}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        }
        listHeader={
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>租户列表</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                当前筛选：
                {status ? <Badge variant={getPlatformTenantStatusMeta(status).variant}>{getPlatformTenantStatusMeta(status).label}</Badge> : <Badge variant="outline">全部状态</Badge>}
              </div>
            </div>
            <Badge variant="outline">共 {pagination.total} 个</Badge>
          </div>
        }
        filters={<PlatformTenantFilters status={status} keyword={keyword} />}
        pagination={pagination}
        currentCount={list.length}
        tableViewportTestId="platform-tenant-list-table-viewport"
        unit="个租户"
      >
        <PlatformTenantsTable tenants={list} />
      </PlatformListPageShell>
    </div>
  );
}
