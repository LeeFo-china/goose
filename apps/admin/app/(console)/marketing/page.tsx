import {
  ClipboardList,
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildTabHref, getCampaigns, getH5Leads, getH5Pages, getProjects, isCurrentPublishedH5Page, normalizeTab, statusLabel, type MarketingPageSearchParams } from "@/app/(console)/marketing/marketing-page-data";

const marketingHeaderStatusBadgeClassName = "shrink-0 whitespace-nowrap tabular-nums";

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
  const HeaderIcon = activeTab === "h5"
    ? MonitorSmartphone
    : activeTab === "leads"
      ? Users
      : Megaphone;
  const headerDescription = activeTab === "h5"
    ? `H5 活动页、展示排序和发布状态。当前共 ${h5Pages.pagination.total} 个页面。`
    : activeTab === "leads"
      ? `H5 表单线索、跟进状态和客户匹配。当前筛选共 ${h5Leads.pagination.total} 条记录。`
      : `活动规则、参与范围和奖励状态。当前筛选共 ${pagination.total} 条记录。`;

  return (
    <div className="flex min-h-[calc(100vh-6.5rem)] flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <HeaderIcon aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">营销活动</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {headerDescription}
            </p>
          </div>
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

      <Tabs value={activeTab} className="flex min-h-0 flex-1 flex-col">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
          <CardHeader className="shrink-0 border-b bg-card px-4 py-0">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <MarketingTabsNav
                activeTab={activeTab}
                hrefs={tabHrefs}
                counts={{
                  campaigns: pagination.total,
                  h5: h5Pages.pagination.total,
                  leads: h5Leads.pagination.total,
                }}
              />
              <div className="flex w-full flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden text-sm text-muted-foreground xl:w-auto xl:justify-end">
                {activeTab === "campaigns" ? (
                  <>
                    <Badge variant="success" className={marketingHeaderStatusBadgeClassName}>
                      <PlayCircle data-icon="inline-start" />
                      {statusLabel.active} {activeCount}
                    </Badge>
                    <Badge variant="warning" className={marketingHeaderStatusBadgeClassName}>
                      <PauseCircle data-icon="inline-start" />
                      {statusLabel.paused} {pausedCount}
                    </Badge>
                  </>
                ) : activeTab === "h5" ? (
                  <>
                    <Badge variant="success" className={marketingHeaderStatusBadgeClassName}>
                      <PlayCircle data-icon="inline-start" />
                      生效中 {activePublishedH5Count}
                    </Badge>
                    <Badge variant="outline" className={marketingHeaderStatusBadgeClassName}>
                      <ClipboardList data-icon="inline-start" />
                      草稿 {draftH5Count}
                    </Badge>
                    <Badge variant="warning" className={marketingHeaderStatusBadgeClassName}>
                      <PauseCircle data-icon="inline-start" />
                      下线 {offlineH5Count}
                    </Badge>
                  </>
                ) : (
                  <>
                    <Badge variant="default" className={marketingHeaderStatusBadgeClassName}>
                      <ClipboardList data-icon="inline-start" />
                      新线索 {newLeadCount}
                    </Badge>
                    <Badge variant="success" className={marketingHeaderStatusBadgeClassName}>
                      <PlayCircle data-icon="inline-start" />
                      已转化 {convertedLeadCount}
                    </Badge>
                    <Badge variant="secondary" className={marketingHeaderStatusBadgeClassName}>
                      <PauseCircle data-icon="inline-start" />
                      已作废 {invalidLeadCount}
                    </Badge>
                  </>
                )}
              </div>
            </div>
            {activeTab === "campaigns" ? (
              <div className="pb-3">
                <MarketingFilters
                  campaignType={campaignType}
                  status={status}
                  keyword={keyword}
                />
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
            <TabsContent value="campaigns" className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              {error ? (
                <div className="shrink-0 px-4 pt-4">
                  <StatusAlert>{error}</StatusAlert>
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto">
                <MarketingCampaignsTable campaigns={list} projects={projects} />
              </div>
              <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">
                    第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
                  </Badge>
                  <span className="tabular-nums">
                    当前显示 {list.length} 条，共 {pagination.total} 条
                  </span>
                </div>
                <MarketingPagination
                  pagination={pagination}
                  campaignType={campaignType}
                  status={status}
                  keyword={keyword}
                />
              </div>
            </TabsContent>

            <TabsContent value="h5" className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              {h5Pages.error ? (
                <div className="shrink-0 px-4 pt-4">
                  <StatusAlert>{h5Pages.error}</StatusAlert>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                  <H5MarketingPagesTable pages={h5Pages.list} tenantSlug={tenantSlug} />
                </div>
              )}
              <div className="shrink-0 flex flex-col gap-2 border-t bg-card px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                <span className="tabular-nums">
                  当前显示 {h5Pages.list.length} 个页面，共 {h5Pages.pagination.total} 个
                </span>
                <span>
                  发布后访问 H5 页面路径，展示顺序以生效中的页面为准
                </span>
              </div>
            </TabsContent>

            <TabsContent value="leads" className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
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
