import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, Coins, CreditCard, WalletCards } from "lucide-react";
import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSession } from "@/lib/auth";
import { BillingEventsTab, BillingTenantsTab } from "@/app/(console)/platform/billing/billing-account-tabs";
import { BillingRechargeTab } from "@/app/(console)/platform/billing/billing-recharge-tab";
import { BillingRechargeRefundsTab } from "@/app/(console)/platform/billing/billing-recharge-refunds-tab";
import { BillingAiTab, BillingLedgerTab, BillingPricingTab } from "@/app/(console)/platform/billing/billing-usage-tabs";
import { buildQuery, cleanParam, emptyAiFilterOptions, emptyAiUsageStats, emptyEventList, emptyLedgerList, emptyPlatformWechatPayConfig, emptyPricingList, emptyRechargeOrderList, emptyRechargeProductList, emptyRechargeRefundRequestList, emptySummary, emptyTenantList, fetchBackend, formatCredits, normalizeBillingTab, normalizePlatformListPageSize, pickParam, readPositiveInteger, SummaryItem, type SearchParams } from "@/app/(console)/platform/billing/billing-page-shared";
import type {
  BillingAiUsageFilterOptions,
  BillingAiUsageStats,
  BillingEventListData,
  BillingLedgerListData,
  BillingPlatformSummary,
  BillingPricingRuleListData,
  BillingTenantListData,
  PlatformRechargeOrderListData,
  PlatformRechargeProductListData,
  PlatformRechargeRefundRequestListData,
  PlatformWechatPayConfigResult,
} from "@/components/billing/billing-types";

export default async function PlatformBillingPage({
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
  const ledgerPage = readPositiveInteger(params.ledgerPage, 1);
  const ledgerPageSize = normalizePlatformListPageSize(params.ledgerPageSize);
  const rulePage = readPositiveInteger(params.rulePage, 1);
  const rulePageSize = normalizePlatformListPageSize(params.rulePageSize);
  const eventPage = readPositiveInteger(params.eventPage, 1);
  const eventPageSize = normalizePlatformListPageSize(params.eventPageSize);
  const rechargeOrderPage = readPositiveInteger(params.rechargeOrderPage, 1);
  const rechargeOrderPageSize = normalizePlatformListPageSize(params.rechargeOrderPageSize);
  const rechargeRefundPage = readPositiveInteger(params.rechargeRefundPage, 1);
  const rechargeRefundPageSize = normalizePlatformListPageSize(params.rechargeRefundPageSize);
  const activeTab = normalizeBillingTab(params.tab);
  const tenantStatus = pickParam(params.tenantStatus, ["active", "suspended", "closed"] as const);
  const tenantFilters = {
    tenantKeyword: cleanParam(params.tenantKeyword),
    tenantStatus,
    tenantLowBalance: params.tenantLowBalance === "true" ? "true" : undefined,
  };
  const eventStatus = pickParam(params.eventStatus, ["pending", "estimated", "charged", "waived", "refunded", "failed"] as const);
  const eventFilters = {
    eventTenantKeyword: cleanParam(params.eventTenantKeyword),
    eventMetricCode: cleanParam(params.eventMetricCode),
    eventSceneCode: cleanParam(params.eventSceneCode),
    eventSourceType: cleanParam(params.eventSourceType),
    eventStatus,
    eventStartDate: cleanParam(params.eventStartDate),
    eventEndDate: cleanParam(params.eventEndDate),
  };
  const aiMinSampleCount = readPositiveInteger(params.aiMinSampleCount, emptyAiUsageStats.controls.min_sample_count);
  const aiFilters = {
    aiTenantKeyword: cleanParam(params.aiTenantKeyword),
    aiSceneCode: cleanParam(params.aiSceneCode),
    aiProviderCode: cleanParam(params.aiProviderCode),
    aiModelCode: cleanParam(params.aiModelCode),
    aiStartDate: cleanParam(params.aiStartDate),
    aiEndDate: cleanParam(params.aiEndDate),
    aiMinSampleCount: params.aiMinSampleCount ? aiMinSampleCount : undefined,
  };
  const ruleScope = pickParam(params.ruleScope, ["platform_default", "tenant_override"] as const);
  const ruleEnabled = pickParam(params.ruleEnabled, ["true", "false"] as const);
  const ruleFilters = {
    ruleMetricCode: cleanParam(params.ruleMetricCode),
    ruleScope,
    ruleEnabled,
  };
  const ledgerDirection = pickParam(params.ledgerDirection, ["in", "out", "freeze", "unfreeze"] as const);
  const ledgerFilters = {
    ledgerTenantKeyword: cleanParam(params.ledgerTenantKeyword),
    ledgerDirection,
    ledgerMetricCode: cleanParam(params.ledgerMetricCode),
    ledgerSourceType: cleanParam(params.ledgerSourceType),
    ledgerEventType: cleanParam(params.ledgerEventType),
    ledgerKeyword: cleanParam(params.ledgerKeyword),
    ledgerStartDate: cleanParam(params.ledgerStartDate),
    ledgerEndDate: cleanParam(params.ledgerEndDate),
  };
  const rechargeOrderStatus = pickParam(params.rechargeOrderStatus, ["pending", "paid", "closed", "refunded"] as const);
  const rechargeOrderFilters = {
    rechargeOrderStatus,
    rechargeOrderKeyword: cleanParam(params.rechargeOrderKeyword),
  };
  const rechargeRefundStatus = pickParam(params.rechargeRefundStatus, [
    "pending_review",
    "approved",
    "rejected",
    "refunding",
    "refunded",
    "failed",
  ] as const);
  const rechargeRefundFilters = {
    rechargeRefundStatus,
    rechargeRefundKeyword: cleanParam(params.rechargeRefundKeyword),
  };

  const summaryResult = hasPlatformAccess
    ? await fetchBackend<BillingPlatformSummary>("/platform/billing/summary", emptySummary)
    : { data: emptySummary, error: "当前账号不是平台超管，无法访问计费中心" };
  const tenantsResult = hasPlatformAccess
    ? await fetchBackend<BillingTenantListData>(
      `/platform/billing/tenants?${buildQuery({
        page,
        pageSize,
        keyword: tenantFilters.tenantKeyword,
        status: tenantFilters.tenantStatus,
        low_balance_only: tenantFilters.tenantLowBalance,
      })}`,
      emptyTenantList(page, pageSize),
    )
    : { data: emptyTenantList(page, pageSize), error: null };
  const ledgerResult = hasPlatformAccess
    ? await fetchBackend<BillingLedgerListData>(
      `/platform/billing/ledger?${buildQuery({
        page: ledgerPage,
        pageSize: ledgerPageSize,
        tenant_keyword: ledgerFilters.ledgerTenantKeyword,
        direction: ledgerFilters.ledgerDirection,
        metric_code: ledgerFilters.ledgerMetricCode,
        source_type: ledgerFilters.ledgerSourceType,
        event_type: ledgerFilters.ledgerEventType,
        keyword: ledgerFilters.ledgerKeyword,
        start_date: ledgerFilters.ledgerStartDate,
        end_date: ledgerFilters.ledgerEndDate,
      })}`,
      emptyLedgerList(ledgerPage, ledgerPageSize),
    )
    : { data: emptyLedgerList(ledgerPage, ledgerPageSize), error: null };
  const pricingResult = hasPlatformAccess
    ? await fetchBackend<BillingPricingRuleListData>(
      `/platform/billing/pricing-rules?${buildQuery({
        page: rulePage,
        pageSize: rulePageSize,
        metric_code: ruleFilters.ruleMetricCode,
        scope: ruleFilters.ruleScope,
        enabled: ruleFilters.ruleEnabled,
      })}`,
      emptyPricingList(rulePage, rulePageSize),
    )
    : { data: emptyPricingList(rulePage, rulePageSize), error: null };
  const eventResult = hasPlatformAccess
    ? await fetchBackend<BillingEventListData>(
      `/platform/billing/events?${buildQuery({
        page: eventPage,
        pageSize: eventPageSize,
        tenant_keyword: eventFilters.eventTenantKeyword,
        metric_code: eventFilters.eventMetricCode,
        scene_code: eventFilters.eventSceneCode,
        source_type: eventFilters.eventSourceType,
        status: eventFilters.eventStatus,
        start_date: eventFilters.eventStartDate,
        end_date: eventFilters.eventEndDate,
      })}`,
      emptyEventList(eventPage, eventPageSize),
    )
    : { data: emptyEventList(eventPage, eventPageSize), error: null };
  const aiStatsResult = hasPlatformAccess
    ? await fetchBackend<BillingAiUsageStats>(
      `/platform/billing/ai-usage-stats?${buildQuery({
        tenant_keyword: aiFilters.aiTenantKeyword,
        scene_code: aiFilters.aiSceneCode,
        provider_code: aiFilters.aiProviderCode,
        model_code: aiFilters.aiModelCode,
        start_date: aiFilters.aiStartDate,
        end_date: aiFilters.aiEndDate,
        min_sample_count: aiFilters.aiMinSampleCount,
      })}`,
      emptyAiUsageStats,
    )
    : { data: emptyAiUsageStats, error: null };
  const aiFilterOptionsResult = hasPlatformAccess
    ? await fetchBackend<BillingAiUsageFilterOptions>(
      "/platform/billing/ai-usage-filter-options",
      emptyAiFilterOptions,
    )
    : { data: emptyAiFilterOptions, error: null };
  const platformWechatPayConfigResult = hasPlatformAccess
    ? await fetchBackend<PlatformWechatPayConfigResult>(
      "/platform/payment/wechat-pay/config",
      emptyPlatformWechatPayConfig,
    )
    : { data: emptyPlatformWechatPayConfig, error: null };
  const rechargeProductsResult = hasPlatformAccess
    ? await fetchBackend<PlatformRechargeProductListData>(
      "/platform/billing/recharge-products?page=1&pageSize=100",
      emptyRechargeProductList(),
    )
    : { data: emptyRechargeProductList(), error: null };
  const rechargeOrdersResult = hasPlatformAccess
    ? await fetchBackend<PlatformRechargeOrderListData>(
      `/platform/billing/recharge-orders?${buildQuery({
        page: rechargeOrderPage,
        pageSize: rechargeOrderPageSize,
        status: rechargeOrderFilters.rechargeOrderStatus,
        keyword: rechargeOrderFilters.rechargeOrderKeyword,
      })}`,
      emptyRechargeOrderList(rechargeOrderPage, rechargeOrderPageSize),
    )
    : { data: emptyRechargeOrderList(rechargeOrderPage, rechargeOrderPageSize), error: null };
  const rechargeRefundsResult = hasPlatformAccess
    ? await fetchBackend<PlatformRechargeRefundRequestListData>(
      `/platform/billing/recharge-refund-requests?${buildQuery({
        page: rechargeRefundPage,
        pageSize: rechargeRefundPageSize,
        status: rechargeRefundFilters.rechargeRefundStatus,
        keyword: rechargeRefundFilters.rechargeRefundKeyword,
      })}`,
      emptyRechargeRefundRequestList(rechargeRefundPage, rechargeRefundPageSize),
    )
    : { data: emptyRechargeRefundRequestList(rechargeRefundPage, rechargeRefundPageSize), error: null };
  const activeError = summaryResult.error
    || tenantsResult.error
    || ledgerResult.error
    || pricingResult.error
    || eventResult.error
    || aiStatsResult.error
    || aiFilterOptionsResult.error
    || platformWechatPayConfigResult.error
    || rechargeProductsResult.error
    || rechargeOrdersResult.error
    || rechargeRefundsResult.error;
  const activePagination = activeTab === "tenants"
    ? tenantsResult.data.pagination
    : activeTab === "events"
      ? eventResult.data.pagination
      : activeTab === "pricing"
        ? pricingResult.data.pagination
        : activeTab === "ledger"
          ? ledgerResult.data.pagination
          : activeTab === "recharge"
            ? rechargeOrdersResult.data.pagination
            : activeTab === "refunds"
              ? rechargeRefundsResult.data.pagination
              : { page: 1, pageSize, total: aiStatsResult.data.list.length, totalPages: 1 };
  const activeCount = activeTab === "tenants"
    ? tenantsResult.data.list.length
    : activeTab === "events"
      ? eventResult.data.list.length
      : activeTab === "pricing"
        ? pricingResult.data.list.length
        : activeTab === "ledger"
          ? ledgerResult.data.list.length
          : activeTab === "recharge"
            ? rechargeOrdersResult.data.list.length
            : activeTab === "refunds"
              ? rechargeRefundsResult.data.list.length
              : aiStatsResult.data.list.length;
  const pageKey = activeTab === "ledger"
    ? "ledgerPage"
    : activeTab === "pricing"
      ? "rulePage"
      : activeTab === "events"
        ? "eventPage"
        : activeTab === "recharge"
          ? "rechargeOrderPage"
          : activeTab === "refunds"
            ? "rechargeRefundPage"
            : "page";
  const pageSizeKey = activeTab === "ledger"
    ? "ledgerPageSize"
    : activeTab === "pricing"
      ? "rulePageSize"
      : activeTab === "events"
        ? "eventPageSize"
        : activeTab === "recharge"
          ? "rechargeOrderPageSize"
          : activeTab === "refunds"
            ? "rechargeRefundPageSize"
            : "pageSize";
  const unit = activeTab === "tenants"
    ? "个账户"
    : activeTab === "events"
      ? "条影子计费"
      : activeTab === "pricing"
        ? "条价格规则"
        : activeTab === "ledger"
          ? "条流水"
          : activeTab === "recharge"
            ? "笔充值订单"
            : activeTab === "refunds"
              ? "条退款申请"
              : "个 AI 观察项";

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <Tabs defaultValue={activeTab} className="contents">
        <PlatformListPageShell
          title="计费中心"
          description="管理租户积分账户、人工充值、价格规则和计费流水。"
          titleMeta={<Badge variant="outline">低余额阈值 {formatCredits(summaryResult.data.low_balance_threshold)} 积分</Badge>}
          error={activeError}
          summary={
            <div className="grid gap-3 md:grid-cols-4">
              <SummaryItem key="available" icon={WalletCards} label="可用积分" value={formatCredits(summaryResult.data.total_available_credits)} />
              <SummaryItem key="frozen" icon={Coins} label="冻结积分" value={formatCredits(summaryResult.data.total_frozen_credits)} />
              <SummaryItem key="consumed" icon={CreditCard} label="累计消耗" value={formatCredits(summaryResult.data.total_consumed_credits)} />
              <SummaryItem key="low-balance" icon={AlertCircle} label="低余额租户" value={formatCredits(summaryResult.data.low_balance_count)} />
            </div>
          }
          tabs={
            <TabsList>
              <TabsTrigger value="tenants" asChild>
                <Link href={`/platform/billing?${buildQuery({ tab: "tenants", pageSize })}`}>租户账户</Link>
              </TabsTrigger>
              <TabsTrigger value="events" asChild>
                <Link href={`/platform/billing?${buildQuery({ tab: "events", eventPageSize })}`}>影子计费</Link>
              </TabsTrigger>
              <TabsTrigger value="ai" asChild>
                <Link href={`/platform/billing?${buildQuery({ tab: "ai" })}`}>AI 观察</Link>
              </TabsTrigger>
              <TabsTrigger value="pricing" asChild>
                <Link href={`/platform/billing?${buildQuery({ tab: "pricing", rulePageSize })}`}>价格规则</Link>
              </TabsTrigger>
              <TabsTrigger value="ledger" asChild>
                <Link href={`/platform/billing?${buildQuery({ tab: "ledger", ledgerPageSize })}`}>计费流水</Link>
              </TabsTrigger>
              <TabsTrigger value="recharge" asChild>
                <Link href={`/platform/billing?${buildQuery({ tab: "recharge", rechargeOrderPageSize })}`}>微信充值</Link>
              </TabsTrigger>
              <TabsTrigger value="refunds" asChild>
                <Link href={`/platform/billing?${buildQuery({ tab: "refunds", rechargeRefundPageSize })}`}>退款审核</Link>
              </TabsTrigger>
            </TabsList>
          }
          pagination={activePagination}
          currentCount={activeCount}
          pageKey={pageKey}
          pageSizeKey={pageSizeKey}
          tableViewportTestId="platform-billing-list-table-viewport"
          unit={unit}
        >
          {activeTab === "tenants" ? (
            <BillingTenantsTab tenants={tenantsResult.data} tenantFilters={tenantFilters} />
          ) : activeTab === "events" ? (
            <BillingEventsTab events={eventResult.data} eventFilters={eventFilters} />
          ) : activeTab === "ai" ? (
            <BillingAiTab aiStats={aiStatsResult.data} aiFilterOptions={aiFilterOptionsResult.data} aiFilters={aiFilters} />
          ) : activeTab === "pricing" ? (
            <BillingPricingTab pricing={pricingResult.data} ruleFilters={ruleFilters} />
          ) : activeTab === "recharge" ? (
            <BillingRechargeTab
              configResult={platformWechatPayConfigResult.data}
              products={rechargeProductsResult.data}
              orders={rechargeOrdersResult.data}
              orderFilters={rechargeOrderFilters}
            />
          ) : activeTab === "refunds" ? (
            <BillingRechargeRefundsTab
              refunds={rechargeRefundsResult.data}
              refundFilters={rechargeRefundFilters}
            />
          ) : (
            <BillingLedgerTab ledger={ledgerResult.data} ledgerFilters={ledgerFilters} />
          )}
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}
