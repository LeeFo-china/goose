import { redirect } from "next/navigation";
import { CreateH5MarketingPageButton } from "@/components/marketing/h5-page-mutations";
import { H5MarketingPagesTable } from "@/components/marketing/h5-pages-table";
import type {
  H5MarketingPageRecord,
  Pagination,
} from "@/components/marketing/marketing-types";
import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const PLATFORM_H5_API_BASE_PATH = "/platform/marketing-pages";
const PLATFORM_H5_EDIT_BASE_PATH = "/platform/marketing-pages";
const PLATFORM_H5_RETURN_TO = "/platform/marketing-pages";

type PlatformH5PageListData = {
  list: H5MarketingPageRecord[];
  pagination: Pagination;
};

type SearchParams = Promise<{
  page?: string;
  pageSize?: string;
}>;

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildPlatformH5PageQuery(input: {
  page: number;
  pageSize: number;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  return query.toString();
}

async function getPlatformH5Pages(input: {
  page: number;
  pageSize: number;
}) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [] as H5MarketingPageRecord[],
      pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(
      buildBackendUrl(`${PLATFORM_H5_API_BASE_PATH}?${buildPlatformH5PageQuery(input)}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<PlatformH5PageListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [] as H5MarketingPageRecord[],
      pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "平台 H5 活动页加载失败",
    };
  }
}

function summarizePages(list: H5MarketingPageRecord[]) {
  return {
    published: list.filter((item) => item.status === "published").length,
    draft: list.filter((item) => item.status === "draft").length,
    offline: list.filter((item) => item.status === "offline").length,
  };
}

function isCurrentPublishedH5Page(page: H5MarketingPageRecord, now = Date.now()) {
  if (page.status !== "published") return false;
  const startAt = page.start_at ? new Date(page.start_at).getTime() : null;
  const endAt = page.end_at ? new Date(page.end_at).getTime() : null;

  if (startAt != null && !Number.isNaN(startAt) && startAt > now) return false;
  if (endAt != null && !Number.isNaN(endAt) && endAt < now) return false;

  return true;
}

export default async function PlatformMarketingPagesPage({
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
  const { list, pagination, error } = hasPlatformAccess
    ? await getPlatformH5Pages({ page, pageSize })
    : {
      list: [] as H5MarketingPageRecord[],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "当前账号不是平台超管，无法访问平台 H5 活动页",
    };
  const summary = summarizePages(list);
  const activePublishedCount = list.filter((item) => isCurrentPublishedH5Page(item)).length;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <PlatformListPageShell
        title="平台 H5 活动页"
        description="配置访客态小程序首页和平台公域入口展示的 H5 活动页，发布后通过 h5.goodcms.cn 访问。"
        titleMeta={<Badge variant="outline">平台公域</Badge>}
        action={hasPlatformAccess ? (
          <CreateH5MarketingPageButton
            apiBasePath={PLATFORM_H5_API_BASE_PATH}
            activePageCount={activePublishedCount}
          />
        ) : null}
        error={error}
        summary={
          <div className="grid gap-3 md:grid-cols-4">
            <Card key="total">
              <CardHeader className="pb-2">
                <CardDescription>活动页总数</CardDescription>
                <CardTitle>{pagination.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="published">
              <CardHeader className="pb-2">
                <CardDescription>已发布</CardDescription>
                <CardTitle>{summary.published}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="draft">
              <CardHeader className="pb-2">
                <CardDescription>草稿</CardDescription>
                <CardTitle>{summary.draft}</CardTitle>
              </CardHeader>
            </Card>
            <Card key="offline">
              <CardHeader className="pb-2">
                <CardDescription>已下线</CardDescription>
                <CardTitle>{summary.offline}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        }
        listHeader={
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>H5 活动页列表</CardTitle>
              <CardDescription>
                统一管理平台公域 H5 页面，发布后通过 `h5.goodcms.cn` 对外访问。
              </CardDescription>
            </div>
            <Badge variant="outline">共 {pagination.total} 个</Badge>
          </div>
        }
        pagination={pagination}
        currentCount={list.length}
        tableViewportTestId="platform-h5-page-list-table-viewport"
        unit="个活动页"
      >
        <H5MarketingPagesTable
          pages={list}
          apiBasePath={PLATFORM_H5_API_BASE_PATH}
          editBasePath={PLATFORM_H5_EDIT_BASE_PATH}
          returnTo={PLATFORM_H5_RETURN_TO}
          stickyActionColumn
        />
      </PlatformListPageShell>
    </div>
  );
}
