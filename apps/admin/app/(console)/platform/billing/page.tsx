import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, Coins, CreditCard, WalletCards } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSession } from "@/lib/auth";
import { BillingEventsTab, BillingTenantsTab } from "@/app/(console)/platform/billing/billing-account-tabs";
import { BillingAiTab, BillingLedgerTab, BillingPricingTab } from "@/app/(console)/platform/billing/billing-usage-tabs";
import { buildQuery, cleanParam, emptyAiFilterOptions, emptyAiUsageStats, emptyEventList, emptyLedgerList, emptyPricingList, emptySummary, emptyTenantList, fetchBackend, formatCredits, normalizeBillingTab, pickParam, readPositiveInteger, SummaryItem, type BillingTab, type SearchParams } from "@/app/(console)/platform/billing/billing-page-shared";
import type {
  BillingAiUsageFilterOptions,
  BillingAiUsageStats,
  BillingEventListData,
  BillingLedgerListData,
  BillingPlatformSummary,
  BillingPricingRuleListData,
  BillingTenantListData,
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
  const ledgerPage = readPositiveInteger(params.ledgerPage, 1);
  const rulePage = readPositiveInteger(params.rulePage, 1);
  const eventPage = readPositiveInteger(params.eventPage, 1);
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

  const summaryResult = hasPlatformAccess
    ? await fetchBackend<BillingPlatformSummary>("/platform/billing/summary", emptySummary)
    : { data: emptySummary, error: "当前账号不是平台超管，无法访问计费中心" };
  const tenantsResult = hasPlatformAccess
    ? await fetchBackend<BillingTenantListData>(
      `/platform/billing/tenants?${buildQuery({
        page,
        pageSize: 20,
        keyword: tenantFilters.tenantKeyword,
        status: tenantFilters.tenantStatus,
        low_balance_only: tenantFilters.tenantLowBalance,
      })}`,
      emptyTenantList(page),
    )
    : { data: emptyTenantList(page), error: null };
  const ledgerResult = hasPlatformAccess
    ? await fetchBackend<BillingLedgerListData>(
      `/platform/billing/ledger?${buildQuery({
        page: ledgerPage,
        pageSize: 10,
        tenant_keyword: ledgerFilters.ledgerTenantKeyword,
        direction: ledgerFilters.ledgerDirection,
        metric_code: ledgerFilters.ledgerMetricCode,
        source_type: ledgerFilters.ledgerSourceType,
        event_type: ledgerFilters.ledgerEventType,
        keyword: ledgerFilters.ledgerKeyword,
        start_date: ledgerFilters.ledgerStartDate,
        end_date: ledgerFilters.ledgerEndDate,
      })}`,
      emptyLedgerList(ledgerPage),
    )
    : { data: emptyLedgerList(ledgerPage), error: null };
  const pricingResult = hasPlatformAccess
    ? await fetchBackend<BillingPricingRuleListData>(
      `/platform/billing/pricing-rules?${buildQuery({
        page: rulePage,
        pageSize: 20,
        metric_code: ruleFilters.ruleMetricCode,
        scope: ruleFilters.ruleScope,
        enabled: ruleFilters.ruleEnabled,
      })}`,
      emptyPricingList(rulePage),
    )
    : { data: emptyPricingList(rulePage), error: null };
  const eventResult = hasPlatformAccess
    ? await fetchBackend<BillingEventListData>(
      `/platform/billing/events?${buildQuery({
        page: eventPage,
        pageSize: 20,
        tenant_keyword: eventFilters.eventTenantKeyword,
        metric_code: eventFilters.eventMetricCode,
        scene_code: eventFilters.eventSceneCode,
        source_type: eventFilters.eventSourceType,
        status: eventFilters.eventStatus,
        start_date: eventFilters.eventStartDate,
        end_date: eventFilters.eventEndDate,
      })}`,
      emptyEventList(eventPage),
    )
    : { data: emptyEventList(eventPage), error: null };
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">计费中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理租户积分账户、人工充值、价格规则和计费流水。
          </p>
        </div>
        <Badge variant="outline">低余额阈值 {formatCredits(summaryResult.data.low_balance_threshold)} 积分</Badge>
      </div>

      {summaryResult.error ? <StatusAlert>{summaryResult.error}</StatusAlert> : null}
      {tenantsResult.error ? <StatusAlert>{tenantsResult.error}</StatusAlert> : null}
      {ledgerResult.error ? <StatusAlert>{ledgerResult.error}</StatusAlert> : null}
      {pricingResult.error ? <StatusAlert>{pricingResult.error}</StatusAlert> : null}
      {eventResult.error ? <StatusAlert>{eventResult.error}</StatusAlert> : null}
      {aiStatsResult.error ? <StatusAlert>{aiStatsResult.error}</StatusAlert> : null}
      {aiFilterOptionsResult.error ? <StatusAlert>{aiFilterOptionsResult.error}</StatusAlert> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryItem icon={WalletCards} label="可用积分" value={formatCredits(summaryResult.data.total_available_credits)} />
        <SummaryItem icon={Coins} label="冻结积分" value={formatCredits(summaryResult.data.total_frozen_credits)} />
        <SummaryItem icon={CreditCard} label="累计消耗" value={formatCredits(summaryResult.data.total_consumed_credits)} />
        <SummaryItem icon={AlertCircle} label="低余额租户" value={formatCredits(summaryResult.data.low_balance_count)} />
      </div>

      <Tabs defaultValue={activeTab}>
        <Card>
          <CardHeader className="flex flex-col gap-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <CardTitle>计费运营</CardTitle>
                <CardDescription>账户、试算、价格和流水集中在同一管理区内。</CardDescription>
              </div>
              <Badge variant="outline">当前 {summaryResult.data.active_account_count} 个有效账户</Badge>
            </div>
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="tenants" asChild>
                <Link href={`/platform/billing?${buildQuery({ tab: "tenants" })}`}>租户账户</Link>
              </TabsTrigger>
              <TabsTrigger value="events" asChild>
                <Link href={`/platform/billing?${buildQuery({ tab: "events" })}`}>影子计费</Link>
              </TabsTrigger>
              <TabsTrigger value="ai" asChild>
                <Link href={`/platform/billing?${buildQuery({ tab: "ai" })}`}>AI 观察</Link>
              </TabsTrigger>
              <TabsTrigger value="pricing" asChild>
                <Link href={`/platform/billing?${buildQuery({ tab: "pricing" })}`}>价格规则</Link>
              </TabsTrigger>
              <TabsTrigger value="ledger" asChild>
                <Link href={`/platform/billing?${buildQuery({ tab: "ledger" })}`}>计费流水</Link>
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <BillingTenantsTab tenants={tenantsResult.data} tenantFilters={tenantFilters} />

            <BillingEventsTab events={eventResult.data} eventFilters={eventFilters} />

<BillingAiTab aiStats={aiStatsResult.data} aiFilterOptions={aiFilterOptionsResult.data} aiFilters={aiFilters} />

            <BillingPricingTab pricing={pricingResult.data} ruleFilters={ruleFilters} />

            <BillingLedgerTab ledger={ledgerResult.data} ledgerFilters={ledgerFilters} />
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
