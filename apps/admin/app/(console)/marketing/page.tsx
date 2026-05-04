import {
  ClipboardList,
  Gift,
  Megaphone,
  MonitorSmartphone,
  PauseCircle,
  PlayCircle,
  Users,
} from "lucide-react";
import Link from "next/link";
import { StatusAlert } from "@/components/admin/status-alert";
import { H5MarketingLeadsTable } from "@/components/marketing/h5-leads-table";
import { CreateH5MarketingPageButton } from "@/components/marketing/h5-page-mutations";
import { H5MarketingPagesTable } from "@/components/marketing/h5-pages-table";
import { campaignStatusOptions } from "@/components/marketing/marketing-constants";
import {
  MarketingFilters,
  MarketingPagination,
} from "@/components/marketing/marketing-list-actions";
import { CreateMarketingCampaignButton } from "@/components/marketing/marketing-mutations";
import { MarketingCampaignsTable } from "@/components/marketing/marketing-table";
import type {
  H5MarketingLeadRecord,
  H5MarketingPageRecord,
  MarketingCampaignRecord,
  MarketingProjectOption,
  Pagination,
} from "@/components/marketing/marketing-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { cn } from "@/lib/utils";

type MarketingPageSearchParams = {
  tab?: string;
  page?: string;
  campaign_type?: string;
  status?: string;
  keyword?: string;
};

type MarketingTab = "campaigns" | "h5";

type CampaignListData = {
  list: MarketingCampaignRecord[];
  pagination: Pagination;
};

type ProjectListData = {
  list: Array<{
    id: string;
    name: string | null;
    status?: string | null;
    address?: string | null;
  }>;
  pagination: Pagination;
};

type H5PageListData = {
  list: H5MarketingPageRecord[];
  pagination: Pagination;
};

type H5LeadListData = {
  list: H5MarketingLeadRecord[];
  pagination: Pagination;
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizeTab(value: string | undefined): MarketingTab {
  return value === "h5" ? "h5" : "campaigns";
}

function buildTabHref(tab: MarketingTab, params: MarketingPageSearchParams) {
  const query = new URLSearchParams();
  query.set("tab", tab);

  if (tab === "campaigns") {
    if (params.page) query.set("page", params.page);
    if (params.campaign_type) query.set("campaign_type", params.campaign_type);
    if (params.status) query.set("status", params.status);
    if (params.keyword) query.set("keyword", params.keyword);
  }

  return `/marketing?${query.toString()}`;
}

async function fetchBackendData<T>(token: string, path: string) {
  const response = await fetch(buildBackendUrl(path), {
    headers: {
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const payload = await parseBackendJson<T>(response);
  return payload.data as T;
}

async function getCampaigns(token: string | null, params: MarketingPageSearchParams) {
  const page = normalizePage(params.page);
  if (!token) {
    return {
      list: [] as MarketingCampaignRecord[],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  const campaignType = params.campaign_type?.trim() || "";
  const status = params.status?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  if (campaignType) query.set("campaign_type", campaignType);
  if (status) query.set("status", status);
  if (keyword) query.set("keyword", keyword);

  try {
    const data = await fetchBackendData<CampaignListData>(
      token,
      `/employee/marketing-center/campaigns?${query}`,
    );
    return {
      list: data?.list || [],
      pagination: data?.pagination || { page, pageSize: 20, total: 0, totalPages: 0 },
      error: null,
    };
  } catch (error) {
    return {
      list: [] as MarketingCampaignRecord[],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "营销活动列表加载失败",
    };
  }
}

async function getProjects(token: string | null) {
  if (!token) return [] as MarketingProjectOption[];

  try {
    const data = await fetchBackendData<ProjectListData>(
      token,
      "/projects?page=1&pageSize=200",
    );
    return (data?.list || []).map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status || null,
      address: project.address || null,
    }));
  } catch {
    return [] as MarketingProjectOption[];
  }
}

async function getH5Pages(token: string | null) {
  if (!token) {
    return {
      list: [] as H5MarketingPageRecord[],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  try {
    const data = await fetchBackendData<H5PageListData>(
      token,
      "/marketing-pages?page=1&pageSize=10",
    );
    return {
      list: data?.list || [],
      pagination: data?.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      error: null,
    };
  } catch (error) {
    return {
      list: [] as H5MarketingPageRecord[],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "H5 活动页列表加载失败",
    };
  }
}

async function getH5Leads(token: string | null) {
  if (!token) {
    return {
      list: [] as H5MarketingLeadRecord[],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  try {
    const data = await fetchBackendData<H5LeadListData>(
      token,
      "/marketing-leads?page=1&pageSize=10",
    );
    return {
      list: data?.list || [],
      pagination: data?.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      error: null,
    };
  } catch (error) {
    return {
      list: [] as H5MarketingLeadRecord[],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "H5 营销线索加载失败",
    };
  }
}

const statusLabel = Object.fromEntries(campaignStatusOptions);

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<MarketingPageSearchParams>;
}) {
  const params = await searchParams;
  const activeTab = normalizeTab(params.tab);
  const token = await getAdminToken();
  const [{ list, pagination, error }, projects, h5Pages, h5Leads] = await Promise.all([
    getCampaigns(token, params),
    getProjects(token),
    getH5Pages(token),
    getH5Leads(token),
  ]);
  const campaignType = params.campaign_type?.trim() || "";
  const status = params.status?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const activeCount = list.filter((item) => item.status === "active").length;
  const pausedCount = list.filter((item) => item.status === "paused").length;
  const rewardCount = list.filter((item) => item.campaign_type === "appointment_reward").length;
  const shareAssistCount = list.filter((item) => item.campaign_type === "share_assist").length;
  const publishedH5Count = h5Pages.list.filter((item) => item.status === "published").length;
  const newLeadCount = h5Leads.list.filter((item) => item.lead_status === "new").length;
  const convertedLeadCount = h5Leads.list.filter((item) => item.lead_status === "converted").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">营销活动</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            活动规则与 H5 页面分区管理，当前 tab 聚焦一类营销工作流。
          </p>
        </div>
        {activeTab === "campaigns" ? (
          <CreateMarketingCampaignButton projects={projects} />
        ) : (
          <CreateH5MarketingPageButton />
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-md border bg-card p-2">
        <Button
          type="button"
          variant={activeTab === "campaigns" ? "default" : "ghost"}
          className={cn(
            "h-9 shrink-0 gap-2 px-3",
            activeTab !== "campaigns" && "text-muted-foreground",
          )}
          asChild
        >
          <Link href={buildTabHref("campaigns", params)}>
            <Megaphone data-icon="inline-start" />
            活动管理
            <Badge variant={activeTab === "campaigns" ? "secondary" : "outline"}>
              {pagination.total}
            </Badge>
          </Link>
        </Button>
        <Button
          type="button"
          variant={activeTab === "h5" ? "default" : "ghost"}
          className={cn(
            "h-9 shrink-0 gap-2 px-3",
            activeTab !== "h5" && "text-muted-foreground",
          )}
          asChild
        >
          <Link href={buildTabHref("h5", params)}>
            <MonitorSmartphone data-icon="inline-start" />
            H5 活动页
            <Badge variant={activeTab === "h5" ? "secondary" : "outline"}>
              {h5Pages.pagination.total}
            </Badge>
          </Link>
        </Button>
      </div>

      {activeTab === "campaigns" ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <Megaphone className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">筛选活动</div>
                  <div className="text-xl font-semibold">{pagination.total}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <PlayCircle className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">{statusLabel.active}</div>
                  <div className="text-xl font-semibold">{activeCount}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <PauseCircle className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">{statusLabel.paused}</div>
                  <div className="text-xl font-semibold">{pausedCount}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-warning text-warning-foreground">
                  <Gift className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">分享 / 预约</div>
                  <div className="text-xl font-semibold">{shareAssistCount} / {rewardCount}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <MarketingFilters
                campaignType={campaignType}
                status={status}
                keyword={keyword}
              />
            </CardContent>
          </Card>

          {error ? (
            <StatusAlert>{error}</StatusAlert>
          ) : null}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <CardTitle>活动列表</CardTitle>
              <Badge variant="outline">
                第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <MarketingCampaignsTable campaigns={list} projects={projects} />
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              每页 {pagination.pageSize} 条，共 {pagination.total} 条
            </div>
            <MarketingPagination
              pagination={pagination}
              campaignType={campaignType}
              status={status}
              keyword={keyword}
            />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <MonitorSmartphone className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">H5 页面</div>
                  <div className="text-xl font-semibold">{h5Pages.pagination.total}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <PlayCircle className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">当前已发布</div>
                  <div className="text-xl font-semibold">{publishedH5Count}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <Users className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">H5 线索</div>
                  <div className="text-xl font-semibold">{h5Leads.pagination.total}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-warning text-warning-foreground">
                  <ClipboardList className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">新线索 / 已转化</div>
                  <div className="text-xl font-semibold">{newLeadCount} / {convertedLeadCount}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div>
                <CardTitle>H5 活动页</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  用于小程序 web-view 加载的活动页，发布后访问 https://h5.goodcms.cn/p/页面路径。
                </p>
              </div>
              <CreateH5MarketingPageButton />
            </CardHeader>
            <CardContent className="p-0">
              {h5Pages.error ? (
                <div className="p-4">
                  <StatusAlert>{h5Pages.error}</StatusAlert>
                </div>
              ) : (
                <H5MarketingPagesTable pages={h5Pages.list} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div>
                <CardTitle>H5 营销线索</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  最近提交的活动页预约线索，共 {h5Leads.pagination.total} 条，当前列表中新线索 {newLeadCount} 条。
                </p>
              </div>
              <Badge variant="outline">
                最近 {h5Leads.list.length} 条
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {h5Leads.error ? (
                <div className="p-4">
                  <StatusAlert>{h5Leads.error}</StatusAlert>
                </div>
              ) : (
                <H5MarketingLeadsTable leads={h5Leads.list} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
