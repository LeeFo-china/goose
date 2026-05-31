import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { BrainCircuit, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { BillingAiUsageFilterOptions, BillingAiUsageStats, BillingEventListData, BillingLedgerListData, BillingPlatformSummary, BillingPricingRuleListData, BillingTenantListData, Pagination } from "@/components/billing/billing-types";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

export type SearchParams = Promise<{
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

export type BillingTab = "tenants" | "events" | "ai" | "pricing" | "ledger";
export type QueryValue = string | number | boolean | undefined;

export const billingTabs: BillingTab[] = ["tenants", "events", "ai", "pricing", "ledger"];

export const emptySummary: BillingPlatformSummary = {
  tenant_count: 0,
  active_account_count: 0,
  total_balance_credits: 0,
  total_frozen_credits: 0,
  total_available_credits: 0,
  total_consumed_credits: 0,
  low_balance_count: 0,
  low_balance_threshold: 5000,
};

export const emptyAiUsageStats: BillingAiUsageStats = {
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

export const emptyAiFilterOptions: BillingAiUsageFilterOptions = {
  tenants: [],
  scene_codes: [],
  scene_options: [],
  provider_codes: [],
  provider_options: [],
  models: [],
};

export function emptyTenantList(page: number): BillingTenantListData {
  return {
    list: [],
    pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
    low_balance_threshold: 5000,
  };
}

export function emptyLedgerList(page: number): BillingLedgerListData {
  return {
    list: [],
    pagination: { page, pageSize: 10, total: 0, totalPages: 0 },
  };
}

export function emptyPricingList(page: number): BillingPricingRuleListData {
  return {
    list: [],
    pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
  };
}

export function emptyEventList(page: number): BillingEventListData {
  return {
    list: [],
    pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
  };
}

export function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeBillingTab(value: string | undefined): BillingTab {
  return billingTabs.includes(value as BillingTab) ? value as BillingTab : "tenants";
}

export function cleanParam(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function pickParam<T extends string>(value: string | undefined, options: readonly T[]) {
  return options.includes(value as T) ? value as T : undefined;
}

export function buildQuery(input: Record<string, QueryValue>) {
  const query = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

export async function fetchBackend<T>(path: string, fallback: T) {
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

export function formatCredits(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("zh-CN");
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function directionLabel(direction: string) {
  const labels: Record<string, string> = {
    in: "入账",
    out: "扣费",
    freeze: "冻结",
    unfreeze: "解冻",
  };
  return labels[direction] || direction;
}

export function scopeLabel(scope: string) {
  return scope === "tenant_override" ? "租户定制价" : "平台默认价";
}

export function eventStatusLabel(status: string) {
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

export function readinessLabel(ready: boolean) {
  return ready ? "样本达标" : "继续观察";
}

export function readinessReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    sample_insufficient: "样本不足",
    usage_missing: "缺 token",
    pricing_rule_missing: "缺价格规则",
    credit_p95_zero: "P95 为 0",
  };
  return labels[reason] || reason;
}

export function SectionHeader({
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

export function PaginationLinks({
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

export function FilterPanel({
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

export function FilterInput({
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

export function AiStatItem({
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

export function SummaryItem({
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
