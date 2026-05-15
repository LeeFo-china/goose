import Link from "next/link";
import { redirect } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { AlertCircle, BrainCircuit, Coins, CreditCard, Landmark, WalletCards } from "lucide-react";
import { ManualRechargeButton, PricingRuleCreateButton, PricingRuleStatusButton, ShadowBillingRunButton } from "@/components/billing/billing-actions";
import { BillingFilterCombobox } from "@/components/billing/billing-filter-combobox";
import { FilterSelect } from "@/components/admin/filter-select";
import type {
  BillingAiUsageFilterOptions,
  BillingAiUsageStats,
  BillingEventListData,
  BillingLedgerListData,
  BillingPlatformSummary,
  BillingPricingRuleListData,
  BillingTenantListData,
  Pagination,
} from "@/components/billing/billing-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type SearchParams = Promise<{
  page?: string;
  ledgerPage?: string;
  rulePage?: string;
  eventPage?: string;
  tab?: string;
  tenantKeyword?: string;
  tenantStatus?: string;
  tenantLowBalance?: string;
  eventTenantKeyword?: string;
  eventMetricCode?: string;
  eventSceneCode?: string;
  eventSourceType?: string;
  eventStatus?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  aiTenantKeyword?: string;
  aiSceneCode?: string;
  aiProviderCode?: string;
  aiModelCode?: string;
  aiStartDate?: string;
  aiEndDate?: string;
  aiMinSampleCount?: string;
  ruleMetricCode?: string;
  ruleScope?: string;
  ruleEnabled?: string;
  ledgerTenantKeyword?: string;
  ledgerDirection?: string;
  ledgerMetricCode?: string;
  ledgerSourceType?: string;
  ledgerEventType?: string;
  ledgerKeyword?: string;
  ledgerStartDate?: string;
  ledgerEndDate?: string;
}>;

type BillingTab = "tenants" | "events" | "ai" | "pricing" | "ledger";
type QueryValue = string | number | boolean | undefined | null;

const billingTabs: BillingTab[] = ["tenants", "events", "ai", "pricing", "ledger"];

const emptySummary: BillingPlatformSummary = {
  tenant_count: 0,
  active_account_count: 0,
  total_balance_credits: 0,
  total_frozen_credits: 0,
  total_available_credits: 0,
  total_consumed_credits: 0,
  low_balance_count: 0,
  low_balance_threshold: 5000,
};

const emptyAiUsageStats: BillingAiUsageStats = {
  range: { start_date: null, end_date: null },
  controls: { limit: 5000, min_sample_count: 100, safety_factor: 1.5 },
  totals: {
    groups: 0,
    logs: 0,
    billable_samples: 0,
    missing_usage: 0,
    ready_groups: 0,
    watch_groups: 0,
    pricing_rule_missing_groups: 0,
    usage_missing_groups: 0,
  },
  list: [],
};

const emptyAiFilterOptions: BillingAiUsageFilterOptions = {
  tenants: [],
  scene_codes: [],
  scene_options: [],
  provider_codes: [],
  provider_options: [],
  models: [],
};

function emptyTenantList(page: number): BillingTenantListData {
  return {
    list: [],
    pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
    low_balance_threshold: 5000,
  };
}

function emptyLedgerList(page: number): BillingLedgerListData {
  return {
    list: [],
    pagination: { page, pageSize: 10, total: 0, totalPages: 0 },
  };
}

function emptyPricingList(page: number): BillingPricingRuleListData {
  return {
    list: [],
    pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
  };
}

function emptyEventList(page: number): BillingEventListData {
  return {
    list: [],
    pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
  };
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBillingTab(value: string | undefined): BillingTab {
  return billingTabs.includes(value as BillingTab) ? value as BillingTab : "tenants";
}

function cleanParam(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function pickParam<T extends string>(value: string | undefined, options: readonly T[]) {
  return options.includes(value as T) ? value as T : undefined;
}

function buildQuery(input: Record<string, QueryValue>) {
  const query = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

async function fetchBackend<T>(path: string, fallback: T) {
  const token = await getAdminToken();
  if (!token) {
    return { data: fallback, error: "缺少登录凭证" };
  }

  try {
    const response = await fetch(buildBackendUrl(path), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<T>(response);
    return { data: payload.data || fallback, error: null };
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error.message : "计费数据加载失败",
    };
  }
}

function formatCredits(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function directionLabel(direction: string) {
  const labels: Record<string, string> = {
    in: "入账",
    out: "扣费",
    freeze: "冻结",
    unfreeze: "解冻",
  };
  return labels[direction] || direction;
}

function scopeLabel(scope: string) {
  return scope === "tenant_override" ? "租户定制价" : "平台默认价";
}

function eventStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待处理",
    estimated: "已试算",
    charged: "已扣费",
    waived: "已免除",
    refunded: "已退回",
    failed: "异常",
  };
  return labels[status] || status;
}

function readinessLabel(ready: boolean) {
  return ready ? "样本达标" : "继续观察";
}

function readinessReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    sample_insufficient: "样本不足",
    usage_missing: "缺 token",
    pricing_rule_missing: "缺价格规则",
    credit_p95_zero: "P95 为 0",
  };
  return labels[reason] || reason;
}

function SectionHeader({
  title,
  description,
  badge,
  badgeVariant = "outline",
  action,
}: {
  title: string;
  description: string;
  badge?: string;
  badgeVariant?: ComponentProps<typeof Badge>["variant"];
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-normal">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {badge ? <Badge variant={badgeVariant}>{badge}</Badge> : null}
        {action}
      </div>
    </div>
  );
}

function PaginationLinks({
  pagination,
  pageKey,
  tab,
  filters,
}: {
  pagination: Pagination;
  pageKey: "page" | "ledgerPage" | "rulePage" | "eventPage";
  tab: BillingTab;
  filters?: Record<string, QueryValue>;
}) {
  const prevPage = Math.max(1, pagination.page - 1);
  const nextPage = pagination.page + 1;

  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>共 {pagination.total} 条</span>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="outline" disabled={pagination.page <= 1}>
          <Link href={`/platform/billing?${buildQuery({ ...filters, tab, [pageKey]: prevPage })}`}>上一页</Link>
        </Button>
        <span>{pagination.page} / {Math.max(1, pagination.totalPages)}</span>
        <Button asChild size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages}>
          <Link href={`/platform/billing?${buildQuery({ ...filters, tab, [pageKey]: nextPage })}`}>下一页</Link>
        </Button>
      </div>
    </div>
  );
}

function FilterPanel({
  tab,
  children,
}: {
  tab: BillingTab;
  children: ReactNode;
}) {
  return (
    <form action="/platform/billing" className="my-4 rounded-md border bg-muted/20 p-3">
      <input type="hidden" name="tab" value={tab} />
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">{children}</div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/platform/billing?${buildQuery({ tab })}`}>重置</Link>
        </Button>
        <Button type="submit" size="sm">筛选</Button>
      </div>
    </form>
  );
}

function FilterInput({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: "text" | "date" | "number";
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} name={name} type={type} defaultValue={defaultValue || ""} placeholder={placeholder} />
    </Field>
  );
}

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
            <TabsContent value="tenants" className="mt-0">
              <SectionHeader
                title="租户账户"
                description="租户积分余额和人工充值入口。"
                badge={`${tenantsResult.data.pagination.total} 个账户`}
              />
              <FilterPanel tab="tenants">
                <FilterInput
                  label="租户"
                  name="tenantKeyword"
                  defaultValue={tenantFilters.tenantKeyword}
                  placeholder="租户名称或标识"
                />
                <FilterSelect
                  label="账户状态"
                  name="tenantStatus"
                  defaultValue={tenantFilters.tenantStatus}
                  options={[
                    { label: "正常", value: "active" },
                    { label: "暂停", value: "suspended" },
                    { label: "关闭", value: "closed" },
                  ]}
                />
                <FilterSelect
                  label="余额状态"
                  name="tenantLowBalance"
                  defaultValue={tenantFilters.tenantLowBalance}
                  options={[{ label: "只看低余额", value: "true" }]}
                />
              </FilterPanel>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>租户</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">可用</TableHead>
                      <TableHead className="text-right">冻结</TableHead>
                      <TableHead className="text-right">累计充值</TableHead>
                      <TableHead className="text-right">累计消耗</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantsResult.data.list.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          <div className="font-medium">{tenant.name || tenant.slug || "未命名租户"}</div>
                          <div className="text-xs text-muted-foreground">{tenant.slug || tenant.id}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={tenant.low_balance ? "warning" : "outline"}>
                            {tenant.low_balance ? "低余额" : tenant.billing_account.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCredits(tenant.billing_account.available_credits)}</TableCell>
                        <TableCell className="text-right">{formatCredits(tenant.billing_account.frozen_credits)}</TableCell>
                        <TableCell className="text-right">{formatCredits(tenant.billing_account.total_recharged_credits)}</TableCell>
                        <TableCell className="text-right">{formatCredits(tenant.billing_account.total_consumed_credits)}</TableCell>
                        <TableCell className="text-right">
                          <ManualRechargeButton tenant={tenant} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {!tenantsResult.data.list.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                          暂无租户账户
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
                <div className="border-t p-4">
                  <PaginationLinks
                    pagination={tenantsResult.data.pagination}
                    pageKey="page"
                    tab="tenants"
                    filters={tenantFilters}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="events" className="mt-0">
              <SectionHeader
                title="影子计费"
                description="从 AI、短信、短视频日志生成预计账单，不扣真实积分。"
                action={<ShadowBillingRunButton />}
              />
              <FilterPanel tab="events">
                <FilterInput
                  label="租户"
                  name="eventTenantKeyword"
                  defaultValue={eventFilters.eventTenantKeyword}
                  placeholder="租户名称或标识"
                />
                <FilterInput
                  label="计费项"
                  name="eventMetricCode"
                  defaultValue={eventFilters.eventMetricCode}
                  placeholder="metric_code"
                />
                <FilterInput
                  label="场景"
                  name="eventSceneCode"
                  defaultValue={eventFilters.eventSceneCode}
                  placeholder="scene_code"
                />
                <FilterInput
                  label="来源"
                  name="eventSourceType"
                  defaultValue={eventFilters.eventSourceType}
                  placeholder="source_type"
                />
                <FilterSelect
                  label="状态"
                  name="eventStatus"
                  defaultValue={eventFilters.eventStatus}
                  options={[
                    { label: "待处理", value: "pending" },
                    { label: "已试算", value: "estimated" },
                    { label: "已扣费", value: "charged" },
                    { label: "已免除", value: "waived" },
                    { label: "已退回", value: "refunded" },
                    { label: "异常", value: "failed" },
                  ]}
                />
                <FilterInput label="开始时间" name="eventStartDate" type="date" defaultValue={eventFilters.eventStartDate} />
                <FilterInput label="结束时间" name="eventEndDate" type="date" defaultValue={eventFilters.eventEndDate} />
              </FilterPanel>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>租户</TableHead>
                      <TableHead>计费项</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead className="text-right">用量</TableHead>
                      <TableHead className="text-right">预计积分</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventResult.data.list.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>{formatDateTime(event.created_at)}</TableCell>
                        <TableCell>{event.tenant?.name || event.tenant?.slug || event.tenant_id}</TableCell>
                        <TableCell>
                          <div className="font-medium">{event.metric_code}</div>
                          <div className="text-xs text-muted-foreground">{event.scene_code || "-"}</div>
                        </TableCell>
                        <TableCell>
                          <div>{event.source_type}</div>
                          <div className="text-xs text-muted-foreground">{event.source_sub_id || event.source_id}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(event.billable_units || 0).toLocaleString("zh-CN")} {event.unit_name}
                        </TableCell>
                        <TableCell className="text-right">{formatCredits(event.credits)}</TableCell>
                        <TableCell>
                          <Badge variant={event.status === "failed" ? "danger" : "outline"}>
                            {eventStatusLabel(event.status)}
                          </Badge>
                          {event.failure_message ? (
                            <div className="mt-1 text-xs text-muted-foreground">{event.failure_message}</div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!eventResult.data.list.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                          暂无影子计费事件
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
                <div className="border-t p-4">
                  <PaginationLinks
                    pagination={eventResult.data.pagination}
                    pageKey="eventPage"
                    tab="events"
                    filters={eventFilters}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ai" className="mt-0">
              <SectionHeader
                title="AI 试算观察"
                description="按场景和模型观察 token 分布，达标后再进入 AI 真扣费。"
                badge={`${aiStatsResult.data.totals.ready_groups} 个场景可进入真扣费评估`}
                badgeVariant={aiStatsResult.data.totals.ready_groups > 0 ? "success" : "warning"}
              />
              <FilterPanel tab="ai">
                <BillingFilterCombobox
                  label="租户"
                  name="aiTenantKeyword"
                  defaultValue={aiFilters.aiTenantKeyword}
                  placeholder="搜索或选择租户"
                  searchPlaceholder="搜索租户名称或标识"
                  options={aiFilterOptionsResult.data.tenants.map((tenant) => ({
                    value: tenant.name,
                    label: tenant.slug || tenant.id,
                    keywords: [tenant.slug || "", tenant.id],
                  }))}
                />
                <BillingFilterCombobox
                  label="场景"
                  name="aiSceneCode"
                  defaultValue={aiFilters.aiSceneCode}
                  placeholder="搜索或选择场景"
                  searchPlaceholder="搜索场景"
                  options={(aiFilterOptionsResult.data.scene_options.length
                    ? aiFilterOptionsResult.data.scene_options
                    : aiFilterOptionsResult.data.scene_codes.map((code) => ({ code, name: null }))
                  ).map((scene) => ({
                    value: scene.code,
                    label: scene.name || undefined,
                    keywords: [scene.name || ""],
                  }))}
                />
                <BillingFilterCombobox
                  label="供应商"
                  name="aiProviderCode"
                  defaultValue={aiFilters.aiProviderCode}
                  placeholder="搜索或选择供应商"
                  searchPlaceholder="搜索供应商"
                  options={(aiFilterOptionsResult.data.provider_options.length
                    ? aiFilterOptionsResult.data.provider_options
                    : aiFilterOptionsResult.data.provider_codes.map((code) => ({ code, name: null }))
                  ).map((provider) => ({
                    value: provider.code,
                    label: provider.name || undefined,
                    keywords: [provider.name || ""],
                  }))}
                />
                <BillingFilterCombobox
                  label="模型"
                  name="aiModelCode"
                  defaultValue={aiFilters.aiModelCode}
                  placeholder="搜索或选择模型"
                  searchPlaceholder="搜索模型"
                  options={aiFilterOptionsResult.data.models.map((model) => ({
                    value: model.code,
                    label: [model.provider_code, model.name].filter(Boolean).join(" / ") || undefined,
                    keywords: [model.provider_code || "", model.name || ""],
                  }))}
                />
                <FilterInput label="开始时间" name="aiStartDate" type="date" defaultValue={aiFilters.aiStartDate} />
                <FilterInput label="结束时间" name="aiEndDate" type="date" defaultValue={aiFilters.aiEndDate} />
                <FilterInput
                  label="样本门槛"
                  name="aiMinSampleCount"
                  type="number"
                  defaultValue={aiFilters.aiMinSampleCount ? String(aiFilters.aiMinSampleCount) : ""}
                  placeholder="100"
                />
              </FilterPanel>
              <div className="grid gap-3 md:grid-cols-4">
                <AiStatItem label="可评估场景" value={formatCredits(aiStatsResult.data.totals.ready_groups)} />
                <AiStatItem label="需继续观察" value={formatCredits(aiStatsResult.data.totals.watch_groups)} />
                <AiStatItem label="缺价格规则" value={formatCredits(aiStatsResult.data.totals.pricing_rule_missing_groups)} />
                <AiStatItem label="缺 token 场景" value={formatCredits(aiStatsResult.data.totals.usage_missing_groups)} />
              </div>
              <div className="mt-4 overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>场景/模型</TableHead>
                      <TableHead className="text-right">样本</TableHead>
                      <TableHead className="text-right">Token P95</TableHead>
                      <TableHead className="text-right">积分 P95</TableHead>
                      <TableHead className="text-right">建议门槛</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aiStatsResult.data.list.map((item) => (
                      <TableRow key={`${item.scene_code}-${item.provider_code || "-"}-${item.model_code || "-"}`}>
                        <TableCell>
                          <div className="font-medium">{item.scene_code}</div>
                          <div className="text-xs text-muted-foreground">
                            {[item.provider_code, item.model_code || item.model_name].filter(Boolean).join(" / ") || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div>{formatCredits(item.billable_sample_count)}</div>
                          <div className="text-xs text-muted-foreground">
                            总计 {formatCredits(item.total_logs)}
                            {item.sample_gap > 0 ? ` · 差 ${formatCredits(item.sample_gap)}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div>{formatCredits(item.token_percentiles.p95)}</div>
                          <div className="text-xs text-muted-foreground">
                            P50 {formatCredits(item.token_percentiles.p50)} · P99 {formatCredits(item.token_percentiles.p99)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div>{formatCredits(item.credit_percentiles.p95)}</div>
                          <div className="text-xs text-muted-foreground">
                            P50 {formatCredits(item.credit_percentiles.p50)} · P99 {formatCredits(item.credit_percentiles.p99)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{formatCredits(item.suggested_min_charge_credits)}</TableCell>
                        <TableCell>
                          <Badge variant={item.ready_for_phase6 ? "success" : "outline"}>
                            {readinessLabel(item.ready_for_phase6)}
                          </Badge>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {item.ready_for_phase6 ? (
                              <Badge variant="secondary">价格规则已命中</Badge>
                            ) : item.blocking_reasons.map((reason) => (
                              <Badge key={reason} variant={reason === "pricing_rule_missing" ? "danger" : "secondary"}>
                                {readinessReasonLabel(reason)}
                              </Badge>
                            ))}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.missing_usage_count > 0 ? `缺 token ${formatCredits(item.missing_usage_count)} 条` : null}
                            {item.missing_usage_count > 0 && item.missing_pricing_rule_count > 0 ? " · " : null}
                            {item.missing_pricing_rule_count > 0 ? `缺规则 ${formatCredits(item.missing_pricing_rule_count)} 项` : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!aiStatsResult.data.list.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                          暂无 AI 试算观察样本
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
                <span>建议门槛 = 积分 P95 × {aiStatsResult.data.controls.safety_factor}</span>
                <span>Phase 6 前每个主要场景建议至少 {formatCredits(aiStatsResult.data.controls.min_sample_count)} 条成功样本</span>
              </div>
            </TabsContent>

            <TabsContent value="pricing" className="mt-0">
              <SectionHeader
                title="价格规则"
                description="平台默认价和租户定制价。第一版先由超管维护。"
                action={<PricingRuleCreateButton />}
              />
              <FilterPanel tab="pricing">
                <FilterInput
                  label="计费项"
                  name="ruleMetricCode"
                  defaultValue={ruleFilters.ruleMetricCode}
                  placeholder="metric_code"
                />
                <FilterSelect
                  label="范围"
                  name="ruleScope"
                  defaultValue={ruleFilters.ruleScope}
                  options={[
                    { label: "平台默认价", value: "platform_default" },
                    { label: "租户定制价", value: "tenant_override" },
                  ]}
                />
                <FilterSelect
                  label="状态"
                  name="ruleEnabled"
                  defaultValue={ruleFilters.ruleEnabled}
                  options={[
                    { label: "启用", value: "true" },
                    { label: "停用", value: "false" },
                  ]}
                />
              </FilterPanel>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>范围</TableHead>
                      <TableHead>计费项</TableHead>
                      <TableHead>场景/模型</TableHead>
                      <TableHead className="text-right">单价</TableHead>
                      <TableHead className="text-right">最低</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pricingResult.data.list.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>{scopeLabel(rule.scope)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{rule.metric_code}</div>
                          <div className="text-xs text-muted-foreground">优先级 {rule.priority} · v{rule.version}</div>
                        </TableCell>
                        <TableCell>
                          <div>{rule.scene_code || "-"}</div>
                          <div className="text-xs text-muted-foreground">{[rule.provider, rule.model].filter(Boolean).join(" / ") || "-"}</div>
                        </TableCell>
                        <TableCell className="text-right">{formatCredits(rule.unit_credits)} / {rule.unit}</TableCell>
                        <TableCell className="text-right">{formatCredits(rule.min_charge_credits)}</TableCell>
                        <TableCell>
                          <Badge variant={rule.enabled ? "success" : "secondary"}>{rule.enabled ? "启用" : "停用"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <PricingRuleStatusButton rule={rule} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {!pricingResult.data.list.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                          暂无价格规则
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
                <div className="border-t p-4">
                  <PaginationLinks
                    pagination={pricingResult.data.pagination}
                    pageKey="rulePage"
                    tab="pricing"
                    filters={ruleFilters}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ledger" className="mt-0">
              <SectionHeader
                title="计费流水"
                description="最近的充值、扣费、冻结和解冻记录。"
                badge={`${ledgerResult.data.pagination.total} 条流水`}
              />
              <FilterPanel tab="ledger">
                <FilterInput
                  label="租户"
                  name="ledgerTenantKeyword"
                  defaultValue={ledgerFilters.ledgerTenantKeyword}
                  placeholder="租户名称或标识"
                />
                <FilterSelect
                  label="方向"
                  name="ledgerDirection"
                  defaultValue={ledgerFilters.ledgerDirection}
                  options={[
                    { label: "入账", value: "in" },
                    { label: "扣费", value: "out" },
                    { label: "冻结", value: "freeze" },
                    { label: "解冻", value: "unfreeze" },
                  ]}
                />
                <FilterInput
                  label="计费项"
                  name="ledgerMetricCode"
                  defaultValue={ledgerFilters.ledgerMetricCode}
                  placeholder="metric_code"
                />
                <FilterInput
                  label="来源"
                  name="ledgerSourceType"
                  defaultValue={ledgerFilters.ledgerSourceType}
                  placeholder="source_type"
                />
                <FilterInput
                  label="流水类型"
                  name="ledgerEventType"
                  defaultValue={ledgerFilters.ledgerEventType}
                  placeholder="event_type"
                />
                <FilterInput
                  label="关键词"
                  name="ledgerKeyword"
                  defaultValue={ledgerFilters.ledgerKeyword}
                  placeholder="订单号或备注"
                />
                <FilterInput label="开始时间" name="ledgerStartDate" type="date" defaultValue={ledgerFilters.ledgerStartDate} />
                <FilterInput label="结束时间" name="ledgerEndDate" type="date" defaultValue={ledgerFilters.ledgerEndDate} />
              </FilterPanel>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>租户</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead className="text-right">积分</TableHead>
                      <TableHead className="text-right">余额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerResult.data.list.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{formatDateTime(item.created_at)}</TableCell>
                        <TableCell>{item.tenant?.name || item.tenant?.slug || item.tenant_id}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{directionLabel(item.direction)}</Badge>
                          <div className="mt-1 text-xs text-muted-foreground">{item.event_type}</div>
                        </TableCell>
                        <TableCell>{[item.source_type, item.source_id].filter(Boolean).join(" / ") || item.order_no || "-"}</TableCell>
                        <TableCell className="text-right">{formatCredits(item.change_credits)}</TableCell>
                        <TableCell className="text-right">{formatCredits(item.balance_after)}</TableCell>
                      </TableRow>
                    ))}
                    {!ledgerResult.data.list.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                          暂无计费流水
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
                <div className="border-t p-4">
                  <PaginationLinks
                    pagination={ledgerResult.data.pagination}
                    pageKey="ledgerPage"
                    tab="ledger"
                    filters={ledgerFilters}
                  />
                </div>
              </div>
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}

function AiStatItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-3">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{label}</span>
        <BrainCircuit className="size-4" />
      </div>
      <div className="mt-2 text-lg font-semibold tracking-normal">{value}</div>
    </div>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Landmark;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-normal">{value}</div>
    </div>
  );
}
