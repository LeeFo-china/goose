import {
  ClipboardList,
  Gift,
  Megaphone,
  MonitorSmartphone,
  PauseCircle,
  PlayCircle,
  Users,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { H5LeadsPanel } from "@/components/marketing/h5-leads-panel";
import { CreateH5MarketingPageButton } from "@/components/marketing/h5-page-mutations";
import { H5MarketingPagesTable } from "@/components/marketing/h5-pages-table";
import { campaignStatusOptions } from "@/components/marketing/marketing-constants";
import {
  MarketingFilters,
  MarketingPagination,
} from "@/components/marketing/marketing-list-actions";
import { CreateMarketingCampaignButton } from "@/components/marketing/marketing-mutations";
import { MarketingCampaignsTable } from "@/components/marketing/marketing-table";
import {
  MarketingTabsNav,
  type MarketingTabValue,
} from "@/components/marketing/marketing-tabs-nav";
import type {
  H5MarketingLeadRecord,
  H5MarketingPageRecord,
  MarketingCampaignRecord,
  MarketingProjectOption,
  Pagination,
} from "@/components/marketing/marketing-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type MarketingPageSearchParams = {
  tab?: string;
  page?: string;
  campaign_type?: string;
  status?: string;
  keyword?: string;
  lead_page?: string;
  lead_status?: string;
  lead_keyword?: string;
  lead_page_id?: string;
  lead_created_from?: string;
  lead_created_to?: string;
};

type MarketingTab = MarketingTabValue;

type CampaignListData = {
  list: MarketingCampaignRecord[];
  pagination: Pagination;
};

type ProjectListData = {
  list: Array<{
    id: string;
    name: string | null;
    title?: string | null;
    subtitle?: string | null;
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
  if (value === "h5" || value === "leads") {
    return value;
  }

  return "campaigns";
}

function dateStartToIso(value: string) {
  if (!value) return "";
  if (value.includes("T")) return value;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function dateEndToIso(value: string) {
  if (!value) return "";
  if (value.includes("T")) return value;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function buildTabHref(tab: MarketingTab, params: MarketingPageSearchParams) {
  const query = new URLSearchParams();
  query.set("tab", tab);

  if (tab === "campaigns") {
    if (params.page) query.set("page", params.page);
    if (params.campaign_type) query.set("campaign_type", params.campaign_type);
    if (params.status) query.set("status", params.status);
    if (params.keyword) query.set("keyword", params.keyword);
  } else if (tab === "leads") {
    if (params.lead_page) query.set("lead_page", params.lead_page);
    if (params.lead_status) query.set("lead_status", params.lead_status);
    if (params.lead_keyword) query.set("lead_keyword", params.lead_keyword);
    if (params.lead_page_id) query.set("lead_page_id", params.lead_page_id);
    if (params.lead_created_from) query.set("lead_created_from", params.lead_created_from);
    if (params.lead_created_to) query.set("lead_created_to", params.lead_created_to);
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
    const pageSize = 8;
    const data = await fetchBackendData<ProjectListData>(
      token,
      `/marketing-pages/project-options?page=1&pageSize=${pageSize}`,
    );
    return (data?.list || []).map((project) => ({
      id: project.id,
      name: project.name || project.title || project.id,
      status: project.status || null,
      address: project.address || project.subtitle || null,
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
      "/marketing-pages?page=1&pageSize=100",
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

async function getH5Leads(token: string | null, params: MarketingPageSearchParams) {
  const page = normalizePage(params.lead_page);
  if (!token) {
    return {
      list: [] as H5MarketingLeadRecord[],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  const status = params.lead_status?.trim() || "";
  const keyword = params.lead_keyword?.trim() || "";
  const pageId = params.lead_page_id?.trim() || "";
  const createdFrom = params.lead_created_from?.trim() || "";
  const createdTo = params.lead_created_to?.trim() || "";
  if (status) query.set("status", status);
  if (keyword) query.set("keyword", keyword);
  if (pageId) query.set("page_id", pageId);
  if (createdFrom) query.set("created_from", dateStartToIso(createdFrom));
  if (createdTo) query.set("created_to", dateEndToIso(createdTo));

  try {
    const data = await fetchBackendData<H5LeadListData>(
      token,
      `/marketing-leads?${query.toString()}`,
    );
    return {
      list: data?.list || [],
      pagination: data?.pagination || { page, pageSize: 20, total: 0, totalPages: 0 },
      error: null,
    };
  } catch (error) {
    return {
      list: [] as H5MarketingLeadRecord[],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
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
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const activeTab = normalizeTab(params.tab);
  const token = await getAdminToken();
  const [{ list, pagination, error }, projects, h5Pages, h5Leads] = await Promise.all([
    getCampaigns(token, params),
    getProjects(token),
    getH5Pages(token),
    getH5Leads(token, params),
  ]);
  const campaignType = params.campaign_type?.trim() || "";
  const status = params.status?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const leadStatus = params.lead_status?.trim() || "";
  const leadKeyword = params.lead_keyword?.trim() || "";
  const leadPageId = params.lead_page_id?.trim() || "";
  const leadCreatedFrom = params.lead_created_from?.trim() || "";
  const leadCreatedTo = params.lead_created_to?.trim() || "";
  const activeCount = list.filter((item) => item.status === "active").length;
  const pausedCount = list.filter((item) => item.status === "paused").length;
  const rewardCount = list.filter((item) => item.campaign_type === "appointment_reward").length;
  const shareAssistCount = list.filter((item) => item.campaign_type === "share_assist").length;
  const publishedH5Count = h5Pages.list.filter((item) => item.status === "published").length;
  const draftH5Count = h5Pages.list.filter((item) => item.status === "draft").length;
  const offlineH5Count = h5Pages.list.filter((item) => item.status === "offline").length;
  const newLeadCount = h5Leads.list.filter((item) => item.lead_status === "new").length;
  const convertedLeadCount = h5Leads.list.filter((item) => item.lead_status === "converted").length;
  const invalidLeadCount = h5Leads.list.filter((item) => item.lead_status === "invalid").length;
  const tabHrefs: Record<MarketingTabValue, string> = {
    campaigns: buildTabHref("campaigns", params),
    h5: buildTabHref("h5", params),
    leads: buildTabHref("leads", params),
  };

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
        ) : activeTab === "h5" ? (
          <CreateH5MarketingPageButton />
        ) : null}
      </div>

      <Tabs value={activeTab} className="flex flex-col gap-5">
        <MarketingTabsNav
          activeTab={activeTab}
          hrefs={tabHrefs}
          counts={{
            campaigns: pagination.total,
            h5: h5Pages.pagination.total,
            leads: h5Leads.pagination.total,
          }}
        />

        <TabsContent value="campaigns" className="m-0 flex flex-col gap-5">
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
        </TabsContent>

        <TabsContent value="h5" className="m-0 flex flex-col gap-5">
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
                  <ClipboardList className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">草稿页面</div>
                  <div className="text-xl font-semibold">{draftH5Count}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-warning text-warning-foreground">
                  <PauseCircle className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">已下线</div>
                  <div className="text-xl font-semibold">{offlineH5Count}</div>
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
        </TabsContent>

        <TabsContent value="leads" className="m-0 flex flex-col gap-5">
          <div className="grid gap-3 md:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <Users className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">筛选线索</div>
                  <div className="text-xl font-semibold">{h5Leads.pagination.total}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <ClipboardList className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">新线索</div>
                  <div className="text-xl font-semibold">{newLeadCount}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <PlayCircle className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">已转化</div>
                  <div className="text-xl font-semibold">{convertedLeadCount}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-warning text-warning-foreground">
                  <PauseCircle className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">已作废</div>
                  <div className="text-xl font-semibold">{invalidLeadCount}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <H5LeadsPanel
            initialData={h5Leads}
            initialFilters={{
              status: leadStatus,
              pageId: leadPageId,
              keyword: leadKeyword,
              createdFrom: leadCreatedFrom,
              createdTo: leadCreatedTo,
            }}
            pages={h5Pages.list}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
