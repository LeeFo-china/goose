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

function appendOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}
