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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildTabHref, getCampaigns, getH5Leads, getH5Pages, getProjects, isCurrentPublishedH5Page, normalizeTab, statusLabel, type MarketingPageSearchParams } from "@/app/(console)/marketing/marketing-page-data";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<MarketingPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const activeTab = normalizeTab(params.tab);
  const [token, session] = await Promise.all([
    getAdminToken(),
    getAdminSession(),
  ]);
  const tenantSlug = session?.tenant?.slug || null;
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
  const activePublishedH5Count = h5Pages.list.filter((item) => isCurrentPublishedH5Page(item)).length;
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
          <CreateH5MarketingPageButton
            tenantSlug={tenantSlug}
            activePageCount={activePublishedH5Count}
          />
        ) : null}
      </div>

      {activeTab === "campaigns" ? (
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
      ) : activeTab === "h5" ? (
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
      ) : (
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
      )}

      <Tabs value={activeTab}>
        <Card>
          <CardHeader className="pb-3">
            <MarketingTabsNav
              activeTab={activeTab}
              hrefs={tabHrefs}
              counts={{
                campaigns: pagination.total,
                h5: h5Pages.pagination.total,
                leads: h5Leads.pagination.total,
              }}
            />
          </CardHeader>
          <CardContent className="p-0">
            <TabsContent value="campaigns" className="m-0">
              {error ? (
                <div className="border-t px-4 pt-4">
                  <StatusAlert>{error}</StatusAlert>
                </div>
              ) : null}
              <div className="flex flex-col gap-3 border-t px-4 py-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <CardTitle>活动列表</CardTitle>
                    <CardDescription>
                      筛选条件作用于下方活动表格，当前共 {pagination.total} 条记录。
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
                  </Badge>
                </div>
                <MarketingFilters
                  campaignType={campaignType}
                  status={status}
                  keyword={keyword}
                />
              </div>
              <div className="flex flex-col gap-4">
                <MarketingCampaignsTable campaigns={list} projects={projects} />
                <div className="flex flex-col gap-3 px-4 pb-4 md:flex-row md:items-center md:justify-between">
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
              </div>
            </TabsContent>

            <TabsContent value="h5" className="m-0">
              <div className="flex flex-col gap-3 border-t px-4 py-4">
                <div>
                  <CardTitle>H5 活动页</CardTitle>
                  <CardDescription>
                    用于小程序 web-view 加载的活动页，发布后访问 https://h5.goodcms.cn/p/页面路径。
                  </CardDescription>
                </div>
              </div>
              {h5Pages.error ? (
                <div className="px-4 pb-4">
                  <StatusAlert>{h5Pages.error}</StatusAlert>
                </div>
              ) : (
                <H5MarketingPagesTable pages={h5Pages.list} tenantSlug={tenantSlug} />
              )}
            </TabsContent>

            <TabsContent value="leads" className="m-0">
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
                embedded
              />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
