import { redirect } from "next/navigation";
import { CreateH5MarketingPageButton } from "@/components/marketing/h5-page-mutations";
import { H5MarketingPagesTable } from "@/components/marketing/h5-pages-table";
import type {
  H5MarketingPageRecord,
  Pagination,
} from "@/components/marketing/marketing-types";
import { StatusAlert } from "@/components/admin/status-alert";
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

async function getPlatformH5Pages() {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [] as H5MarketingPageRecord[],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(
      buildBackendUrl(`${PLATFORM_H5_API_BASE_PATH}?page=1&pageSize=100`),
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
        pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [] as H5MarketingPageRecord[],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
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

export default async function PlatformMarketingPagesPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  const hasPlatformAccess = session.roles.includes("platform_admin");
  const { list, pagination, error } = hasPlatformAccess
    ? await getPlatformH5Pages()
    : {
      list: [] as H5MarketingPageRecord[],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      error: "当前账号不是平台超管，无法访问平台 H5 活动页",
    };
  const summary = summarizePages(list);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal">平台 H5 活动页</h1>
            <Badge variant="outline">平台公域</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            配置访客态小程序首页和平台公域入口展示的 H5 活动页，发布后通过 h5.goodcms.cn 访问。
          </p>
        </div>
        {hasPlatformAccess ? (
          <CreateH5MarketingPageButton apiBasePath={PLATFORM_H5_API_BASE_PATH} />
        ) : null}
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>活动页总数</CardDescription>
            <CardTitle>{pagination.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>已发布</CardDescription>
            <CardTitle>{summary.published}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>草稿</CardDescription>
            <CardTitle>{summary.draft}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>已下线</CardDescription>
            <CardTitle>{summary.offline}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <H5MarketingPagesTable
        pages={list}
        apiBasePath={PLATFORM_H5_API_BASE_PATH}
        editBasePath={PLATFORM_H5_EDIT_BASE_PATH}
        returnTo={PLATFORM_H5_RETURN_TO}
      />
    </div>
  );
}
