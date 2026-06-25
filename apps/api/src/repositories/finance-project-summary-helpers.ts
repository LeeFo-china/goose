import type { FinanceProjectSummaryListQuery } from "@/schema/finance";

export function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function normalizeNumber(value: unknown, fallback: number) {
  const numberValue = Number(value ?? fallback);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

export function hasFinanceProjectRiskFilters(
  query: FinanceProjectSummaryListQuery,
) {
  return Boolean(
    query.risk_level ||
      query.risk_flag ||
      query.budget_configured !== undefined ||
      query.has_unallocated_expense !== undefined ||
      query.overdue !== undefined ||
      query.min_budget_usage_ratio !== undefined ||
      query.max_projected_budget_gross_margin !== undefined
  );
}
