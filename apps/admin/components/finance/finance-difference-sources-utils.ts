import type { BadgeProps } from "@/components/ui/badge";

export type FinanceDifferenceSourceType =
  | "correction_audit"
  | "ledger_entry"
  | "receivable_plan"
  | "expense_request";

export type FinanceDifferenceSourcesQuery = {
  month: string;
  page?: number;
  pageSize?: number;
  source_type?: FinanceDifferenceSourceType | string;
  project_id?: string;
};

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const SOURCE_TYPE_META: Record<
  FinanceDifferenceSourceType,
  { label: string; variant: BadgeVariant }
> = {
  correction_audit: { label: "修正审计", variant: "warning" },
  ledger_entry: { label: "财务台账", variant: "success" },
  receivable_plan: { label: "应收计划", variant: "secondary" },
  expense_request: { label: "费用申请", variant: "outline" },
};

export function buildFinanceMonthlyDifferenceSourcesSearchParams(
  query: FinanceDifferenceSourcesQuery,
) {
  const params = new URLSearchParams();
  appendIfPresent(params, "month", query.month);
  params.set("page", String(query.page || 1));
  params.set("pageSize", String(query.pageSize || 20));
  appendIfPresent(params, "source_type", query.source_type);
  appendIfPresent(params, "project_id", query.project_id);
  return params;
}

export function financeDifferenceSourceTypeMeta(
  sourceType: FinanceDifferenceSourceType | string,
): { label: string; variant: BadgeVariant } {
  return SOURCE_TYPE_META[sourceType as FinanceDifferenceSourceType] || {
    label: "未知来源",
    variant: "outline",
  };
}

export function safeFinanceDifferenceSourceHref(
  href: string | null | undefined,
) {
  if (!href) return "/finance/reports/difference-sources";
  if (href.startsWith("/finance/") || href.startsWith("/expenses")) {
    return href;
  }
  return "/finance/reports/difference-sources";
}

function appendIfPresent(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}
