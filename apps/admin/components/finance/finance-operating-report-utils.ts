export type FinanceOperatingReportGroupBy =
  | "day"
  | "month"
  | "project"
  | "payment_type"
  | "cost_category";

export type FinanceOperatingReportQuery = {
  date_from?: string;
  date_to?: string;
  group_by?: FinanceOperatingReportGroupBy | string;
  project_id?: string;
  project_status?: string;
};

export type FinanceMonthlyOverviewQuery = {
  month?: string;
};

export type FinanceProjectRankingQuery = {
  month?: string;
  date_from?: string;
  date_to?: string;
  project_status?: string;
  page?: number;
  pageSize?: number;
  sort_by?: string;
  sort_order?: string;
};

export type FinanceCostCategorySummaryQuery = {
  month?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  pageSize?: number;
  sort_by?: string;
  sort_order?: string;
};

export type FinanceReceivableAgingQuery = {
  as_of?: string;
  project_status?: string;
  page?: number;
  pageSize?: number;
};

export type FinanceClosingStatus =
  | "not_started"
  | "draft"
  | "closed"
  | "reopened";

export function buildFinanceOperatingReportSearchParams(
  query: FinanceOperatingReportQuery,
) {
  const params = new URLSearchParams();
  appendOptionalParam(params, "date_from", query.date_from);
  appendOptionalParam(params, "date_to", query.date_to);
  appendOptionalParam(params, "group_by", query.group_by);
  appendOptionalParam(params, "project_id", query.project_id);
  appendOptionalParam(params, "project_status", query.project_status);
  return params;
}

export function buildFinanceMonthlyOverviewSearchParams(
  query: FinanceMonthlyOverviewQuery,
) {
  const params = new URLSearchParams();
  appendOptionalParam(params, "month", query.month);
  return params;
}

export function buildFinanceProjectRankingSearchParams(
  query: FinanceProjectRankingQuery,
) {
  const params = new URLSearchParams();
  appendOptionalParam(params, "month", query.month);
  appendOptionalParam(params, "date_from", query.date_from);
  appendOptionalParam(params, "date_to", query.date_to);
  appendOptionalParam(params, "project_status", query.project_status);
  appendOptionalNumberParam(params, "page", query.page);
  appendOptionalNumberParam(params, "pageSize", query.pageSize);
  appendOptionalParam(params, "sort_by", query.sort_by);
  appendOptionalParam(params, "sort_order", query.sort_order);
  return params;
}

export function buildFinanceCostCategorySummarySearchParams(
  query: FinanceCostCategorySummaryQuery,
) {
  const params = new URLSearchParams();
  appendOptionalParam(params, "month", query.month);
  appendOptionalParam(params, "date_from", query.date_from);
  appendOptionalParam(params, "date_to", query.date_to);
  appendOptionalNumberParam(params, "page", query.page);
  appendOptionalNumberParam(params, "pageSize", query.pageSize);
  appendOptionalParam(params, "sort_by", query.sort_by);
  appendOptionalParam(params, "sort_order", query.sort_order);
  return params;
}

export function buildFinanceReceivableAgingSearchParams(
  query: FinanceReceivableAgingQuery,
) {
  const params = new URLSearchParams();
  appendOptionalParam(params, "as_of", query.as_of);
  appendOptionalParam(params, "project_status", query.project_status);
  appendOptionalNumberParam(params, "page", query.page);
  appendOptionalNumberParam(params, "pageSize", query.pageSize);
  return params;
}

export function financeOperatingGroupByLabel(
  value: FinanceOperatingReportGroupBy | string | null | undefined,
) {
  if (value === "day") return "按日期";
  if (value === "month") return "按月份";
  if (value === "project") return "按项目";
  if (value === "payment_type") return "按收款类型";
  if (value === "cost_category") return "按成本分类";
  return "按月份";
}

export function financeClosingStatusLabel(
  value: FinanceClosingStatus | string | null | undefined,
) {
  if (value === "draft") return "草稿";
  if (value === "closed") return "已结账";
  if (value === "reopened") return "已反结账";
  return "未结账";
}

export function financeClosingStatusVariant(
  value: FinanceClosingStatus | string | null | undefined,
): "outline" | "success" | "warning" {
  if (value === "closed") return "success";
  if (value === "draft" || value === "reopened") return "warning";
  return "outline";
}

export function financeSnapshotDifferenceLabel(
  hasSnapshotDifference: boolean | null | undefined,
) {
  return hasSnapshotDifference ? "数据已变化" : "快照一致";
}

export function financeSnapshotDifferenceVariant(
  hasSnapshotDifference: boolean | null | undefined,
): "outline" | "warning" {
  return hasSnapshotDifference ? "warning" : "outline";
}

function appendOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}

function appendOptionalNumberParam(
  params: URLSearchParams,
  key: string,
  value: number | undefined,
) {
  if (typeof value === "number" && Number.isFinite(value)) {
    params.set(key, String(value));
  }
}
