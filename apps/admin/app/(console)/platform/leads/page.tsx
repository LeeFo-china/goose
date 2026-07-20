import { redirect } from "next/navigation";
import {
  PlatformLeadFilters,
} from "@/components/platform-leads/platform-lead-list-actions";
import { PlatformLeadsTable } from "@/components/platform-leads/platform-leads-table";
import {
  type PlatformLeadListData,
  type PlatformLeadRecord,
  type PlatformLeadStatus,
} from "@/components/platform-leads/platform-lead-types";
import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const LEAD_STATUSES = ["new", "assigned", "invalid"] as const;

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
  return LEAD_STATUSES.includes(value as PlatformLeadStatus) ? value as PlatformLeadStatus : "";
}

function buildLeadQuery(params: {
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

async function getPlatformLeads(input: {
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
        pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
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
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const status = readStatus(params.status);
  const keyword = (params.keyword || "").trim().slice(0, 80);
  const { list, pagination, error } = hasPlatformAccess
    ? await getPlatformLeads({ page, pageSize, status, keyword })
    : {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "当前账号不是平台超管，无法访问平台线索",
    };
  const summary = summarizeCurrentPage(list);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <PlatformListPageShell
        title="平台线索"
        description="管理平台访客装修需求，按手机号在目标租户内去重后手动分配。"
        error={error}
        summary={
          <div className="grid gap-3 md:grid-cols-5">
            <Card key="total">
              <CardHeader className="pb-2">
                <CardDescription>线索总数</CardDescription>
                <CardTitle>{pagination.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="new">
              <CardHeader className="pb-2">
                <CardDescription>本页待分配</CardDescription>
                <CardTitle>{summary.newCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="assigned">
              <CardHeader className="pb-2">
                <CardDescription>本页已分配</CardDescription>
                <CardTitle>{summary.assigned}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="invalid">
              <CardHeader className="pb-2">
                <CardDescription>本页无效</CardDescription>
                <CardTitle>{summary.invalid}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="assigned-customer">
              <CardHeader className="pb-2">
                <CardDescription>本页已关联客户</CardDescription>
                <CardTitle>{summary.assignedWithCustomer}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        }
        filters={<PlatformLeadFilters status={status} keyword={keyword} />}
        pagination={pagination}
        currentCount={list.length}
        tableViewportTestId="platform-lead-list-table-viewport"
        unit="条线索"
      >
        <PlatformLeadsTable leads={list} />
      </PlatformListPageShell>
    </div>
  );
}
