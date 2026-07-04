import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlatformListPageShell, type PlatformListPagination } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import {
  CreateBindingButton,
  CreateLeadServiceFeeButton,
  CreatePartnerButton,
  CreateSettlementBatchButton,
  SyncRechargeRevenueButton,
} from "@/components/platform-partners/platform-partner-actions";
import {
  buildPartnerHref,
  normalizePartnerStatus,
  normalizePartnerTab,
  PARTNER_TABS,
  PlatformPartnerFilters,
  type PartnerPageTab,
} from "@/components/platform-partners/platform-partner-filters";
import {
  PartnerCommissionLedgersTable,
  PartnerSettlementBatchesTable,
  PlatformPartnersTable,
  PlatformRevenueEventsTable,
  TenantPartnerBindingsTable,
} from "@/components/platform-partners/platform-partner-tables";
import type {
  ListData,
  PartnerCommissionLedgerRecord,
  PartnerSettlementBatchRecord,
  PlatformPartnerLevel,
  PlatformPartnerRecord,
  PlatformRevenueEventRecord,
  TenantPartnerBindingRecord,
} from "@/components/platform-partners/platform-partner-types";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type SearchParams = Promise<{
  tab?: string;
  partnerPage?: string;
  partnerPageSize?: string;
  bindingPage?: string;
  bindingPageSize?: string;
  revenuePage?: string;
  revenuePageSize?: string;
  commissionPage?: string;
  commissionPageSize?: string;
  settlementPage?: string;
  settlementPageSize?: string;
  status?: string;
  keyword?: string;
  partner_id?: string;
  tenant_id?: string;
  revenue_type?: string;
  revenue_status?: string;
  commission_status?: string;
  settlement_status?: string;
}>;

const emptyPagination = (page: number, pageSize: number): PlatformListPagination => ({
  page,
  pageSize,
  total: 0,
  totalPages: 0,
});

function emptyList<T>(page: number, pageSize: number): ListData<T> {
  return { list: [], pagination: emptyPagination(page, pageSize) };
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanParam(value: string | undefined) {
  return (value || "").trim().slice(0, 120);
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

async function fetchBackend<T>(path: string, fallback: T) {
  const token = await getAdminToken();
  if (!token) return { data: fallback, error: "缺少登录凭证" };

  try {
    const response = await fetch(buildBackendUrl(path), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<T>(response);
    return { data: payload.data ?? fallback, error: null };
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error.message : "城市合伙人数据加载失败",
    };
  }
}

export default async function PlatformPartnersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const hasPlatformAccess = session.roles.includes("platform_admin");
  const tab = normalizePartnerTab(params.tab);
  const partnerPage = readPositiveInteger(params.partnerPage, 1);
  const partnerPageSize = normalizePlatformListPageSize(params.partnerPageSize);
  const bindingPage = readPositiveInteger(params.bindingPage, 1);
  const bindingPageSize = normalizePlatformListPageSize(params.bindingPageSize);
  const revenuePage = readPositiveInteger(params.revenuePage, 1);
  const revenuePageSize = normalizePlatformListPageSize(params.revenuePageSize);
  const commissionPage = readPositiveInteger(params.commissionPage, 1);
  const commissionPageSize = normalizePlatformListPageSize(params.commissionPageSize);
  const settlementPage = readPositiveInteger(params.settlementPage, 1);
  const settlementPageSize = normalizePlatformListPageSize(params.settlementPageSize);
  const partnerStatus = normalizePartnerStatus(params.status);
  const keyword = cleanParam(params.keyword);
  const partnerId = cleanParam(params.partner_id);
  const tenantId = cleanParam(params.tenant_id);
  const revenueType = cleanParam(params.revenue_type);
  const revenueStatus = cleanParam(params.revenue_status);
  const commissionStatus = cleanParam(params.commission_status);
  const settlementStatus = cleanParam(params.settlement_status);

  const accessError = hasPlatformAccess ? null : "当前账号不是平台超管，无法访问城市合伙人运营";
  const levelsResult = hasPlatformAccess
    ? await fetchBackend<PlatformPartnerLevel[]>("/platform/partners/levels", [])
    : { data: [], error: null };
  const partnerOptionsResult = hasPlatformAccess
    ? await fetchBackend<ListData<PlatformPartnerRecord>>(
      "/platform/partners?page=1&pageSize=100&status=active",
      emptyList<PlatformPartnerRecord>(1, 100),
    )
    : { data: emptyList<PlatformPartnerRecord>(1, 100), error: null };

  const partnerResult = tab === "partners" && hasPlatformAccess
    ? await fetchBackend<ListData<PlatformPartnerRecord>>(
      `/platform/partners?${buildQuery({
        page: partnerPage,
        pageSize: partnerPageSize,
        status: partnerStatus,
        keyword,
      })}`,
      emptyList<PlatformPartnerRecord>(partnerPage, partnerPageSize),
    )
    : { data: emptyList<PlatformPartnerRecord>(partnerPage, partnerPageSize), error: null };
  const bindingResult = tab === "bindings" && hasPlatformAccess
    ? await fetchBackend<ListData<TenantPartnerBindingRecord>>(
      `/platform/partner-bindings?${buildQuery({
        page: bindingPage,
        pageSize: bindingPageSize,
        partner_id: partnerId,
        tenant_id: tenantId,
      })}`,
      emptyList<TenantPartnerBindingRecord>(bindingPage, bindingPageSize),
    )
    : { data: emptyList<TenantPartnerBindingRecord>(bindingPage, bindingPageSize), error: null };
  const revenueResult = tab === "revenue" && hasPlatformAccess
    ? await fetchBackend<ListData<PlatformRevenueEventRecord>>(
      `/platform/partner-revenue/events?${buildQuery({
        page: revenuePage,
        pageSize: revenuePageSize,
        partner_id: partnerId,
        tenant_id: tenantId,
        revenue_type: revenueType,
        status: revenueStatus,
        keyword,
      })}`,
      emptyList<PlatformRevenueEventRecord>(revenuePage, revenuePageSize),
    )
    : { data: emptyList<PlatformRevenueEventRecord>(revenuePage, revenuePageSize), error: null };
  const commissionResult = tab === "commissions" && hasPlatformAccess
    ? await fetchBackend<ListData<PartnerCommissionLedgerRecord>>(
      `/platform/partner-commissions?${buildQuery({
        page: commissionPage,
        pageSize: commissionPageSize,
        partner_id: partnerId,
        revenue_type: revenueType,
        status: commissionStatus,
      })}`,
      emptyList<PartnerCommissionLedgerRecord>(commissionPage, commissionPageSize),
    )
    : { data: emptyList<PartnerCommissionLedgerRecord>(commissionPage, commissionPageSize), error: null };
  const settlementResult = tab === "settlements" && hasPlatformAccess
    ? await fetchBackend<ListData<PartnerSettlementBatchRecord>>(
      `/platform/partner-settlements?${buildQuery({
        page: settlementPage,
        pageSize: settlementPageSize,
        partner_id: partnerId,
        status: settlementStatus,
      })}`,
      emptyList<PartnerSettlementBatchRecord>(settlementPage, settlementPageSize),
    )
    : { data: emptyList<PartnerSettlementBatchRecord>(settlementPage, settlementPageSize), error: null };

  const activePagination = activeList(tab, {
    partners: partnerResult.data,
    bindings: bindingResult.data,
    revenue: revenueResult.data,
    commissions: commissionResult.data,
    settlements: settlementResult.data,
  }).pagination;
  const activeCount = activeList(tab, {
    partners: partnerResult.data,
    bindings: bindingResult.data,
    revenue: revenueResult.data,
    commissions: commissionResult.data,
    settlements: settlementResult.data,
  }).list.length;
  const activeError = accessError
    || levelsResult.error
    || partnerOptionsResult.error
    || partnerResult.error
    || bindingResult.error
    || revenueResult.error
    || commissionResult.error
    || settlementResult.error;
  const activePartners = partnerOptionsResult.data.list;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <Tabs value={tab} className="contents">
        <PlatformListPageShell
          title="城市合伙人"
          description="管理区域合伙人、装企归属、平台收入分成、分佣台账和人工月结。"
          titleMeta={<Badge variant="outline">月结 / 人工打款</Badge>}
          action={hasPlatformAccess ? actionForTab(tab, levelsResult.data, activePartners) : null}
          error={activeError}
          tabs={
            <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden">
              {PARTNER_TABS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} asChild className="shrink-0">
                  <Link href={buildPartnerHref({ tab: item.value })}>{item.label}</Link>
                </TabsTrigger>
              ))}
            </TabsList>
          }
          filters={
            <PlatformPartnerFilters
              tab={tab}
              partnerStatus={partnerStatus}
              keyword={keyword}
              partnerId={partnerId}
              tenantId={tenantId}
              revenueType={revenueType}
              revenueStatus={revenueStatus}
              commissionStatus={commissionStatus}
              settlementStatus={settlementStatus}
              partners={activePartners}
            />
          }
          pagination={activePagination}
          currentCount={activeCount}
          pageKey={pageKeyForTab(tab)}
          pageSizeKey={pageSizeKeyForTab(tab)}
          tableViewportTestId="platform-partner-list-table-viewport"
          unit={unitForTab(tab)}
        >
          <TabsContent value="partners" className="m-0 min-h-full">
            <PlatformPartnersTable list={partnerResult.data.list} />
          </TabsContent>
          <TabsContent value="bindings" className="m-0 min-h-full">
            <TenantPartnerBindingsTable list={bindingResult.data.list} />
          </TabsContent>
          <TabsContent value="revenue" className="m-0 min-h-full">
            <PlatformRevenueEventsTable list={revenueResult.data.list} />
          </TabsContent>
          <TabsContent value="commissions" className="m-0 min-h-full">
            <PartnerCommissionLedgersTable list={commissionResult.data.list} />
          </TabsContent>
          <TabsContent value="settlements" className="m-0 min-h-full">
            <PartnerSettlementBatchesTable list={settlementResult.data.list} />
          </TabsContent>
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}

function actionForTab(
  tab: PartnerPageTab,
  levels: PlatformPartnerLevel[],
  partners: PlatformPartnerRecord[],
) {
  if (tab === "partners") return <CreatePartnerButton levels={levels} />;
  if (tab === "bindings") return <CreateBindingButton partners={partners} />;
  if (tab === "revenue") {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <CreateLeadServiceFeeButton />
        <SyncRechargeRevenueButton />
      </div>
    );
  }
  if (tab === "commissions" || tab === "settlements") {
    return <CreateSettlementBatchButton partners={partners} />;
  }
  return null;
}

function activeList(
  tab: PartnerPageTab,
  lists: Record<PartnerPageTab, ListData<unknown>>,
) {
  return lists[tab];
}

function pageKeyForTab(tab: PartnerPageTab) {
  if (tab === "bindings") return "bindingPage";
  if (tab === "revenue") return "revenuePage";
  if (tab === "commissions") return "commissionPage";
  if (tab === "settlements") return "settlementPage";
  return "partnerPage";
}

function pageSizeKeyForTab(tab: PartnerPageTab) {
  if (tab === "bindings") return "bindingPageSize";
  if (tab === "revenue") return "revenuePageSize";
  if (tab === "commissions") return "commissionPageSize";
  if (tab === "settlements") return "settlementPageSize";
  return "partnerPageSize";
}

function unitForTab(tab: PartnerPageTab) {
  if (tab === "bindings") return "条绑定";
  if (tab === "revenue") return "条收入";
  if (tab === "commissions") return "条分佣";
  if (tab === "settlements") return "个月结批次";
  return "个合伙人";
}
