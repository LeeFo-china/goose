import { redirect } from "next/navigation";
import { FileCheck2 } from "lucide-react";
import { getWechatPayApplymentStatusMeta } from "@/components/finance/finance-wechat-pay-applyment-shared";
import {
  fetchPlatformWechatPayApplyments,
} from "@/components/platform-wechat-pay/platform-wechat-pay-applyment-requests";
import { PlatformWechatPayApplymentFilters } from "@/components/platform-wechat-pay/platform-wechat-pay-applyment-filters";
import { PlatformWechatPayApplymentsTable } from "@/components/platform-wechat-pay/platform-wechat-pay-applyments-table";
import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";

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

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || "";
}

function summarize(list: Awaited<ReturnType<typeof fetchPlatformWechatPayApplyments>>["list"]) {
  return {
    submitted: list.filter((item) => item.status === "submitted").length,
    processing: list.filter((item) =>
      [
        "approved",
        "applying",
        "wechat_editing",
        "reviewing",
        "account_verifying",
        "signing",
        "opening",
      ].includes(item.status)
    ).length,
    active: list.filter((item) => item.status === "active").length,
  };
}

export default async function PlatformWechatPayApplymentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  const hasPlatformAccess = session.roles.includes("platform_admin");
  const params = await searchParams;
  const page = readPositiveInteger(params.page, 1);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const status = clean(params.status);
  const keyword = clean(params.keyword).slice(0, 80);
  const data = hasPlatformAccess
    ? await fetchPlatformWechatPayApplyments({ page, pageSize, status, keyword })
    : {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "当前账号不是平台超管，无法访问支付进件申请",
    };
  const summary = summarize(data.list);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <PlatformListPageShell
        title="支付进件"
        description="审核租户开通资料，提交微信正式进件并跟踪官方状态。"
        leading={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <FileCheck2 aria-hidden="true" className="size-4" />
          </span>
        }
        error={data.error}
        summary={
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>申请总数</CardDescription>
                <CardTitle>{data.pagination.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>本页待审核</CardDescription>
                <CardTitle>{summary.submitted}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>本页处理中</CardDescription>
                <CardTitle>{summary.processing}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>本页已启用</CardDescription>
                <CardTitle>{summary.active}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        }
        listHeader={
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>申请列表</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                当前筛选：
                {status ? (
                  <Badge variant="outline">
                    {getWechatPayApplymentStatusMeta(status).label}
                  </Badge>
                ) : <Badge variant="outline">全部状态</Badge>}
              </div>
            </div>
            <Badge variant="outline">共 {data.pagination.total} 条</Badge>
          </div>
        }
        filters={
          <PlatformWechatPayApplymentFilters
            status={status}
            keyword={keyword}
          />
        }
        pagination={data.pagination}
        currentCount={data.list.length}
        tableViewportTestId="platform-wechat-pay-applyments-table-viewport"
        unit="条申请"
      >
        <PlatformWechatPayApplymentsTable rows={data.list} />
      </PlatformListPageShell>
    </div>
  );
}
