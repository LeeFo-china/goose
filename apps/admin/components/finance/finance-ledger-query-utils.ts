export type FinanceLedgerQueryInput = {
  page?: number;
  pageSize?: number;
  project_id?: string;
  direction?: string;
  entry_type?: string;
  cost_category_id?: string;
  unallocated_only?: string;
};

export type FinanceLedgerPageFilters = {
  project_id?: string;
  direction?: string;
  entry_type?: string;
  cost_category_id?: string;
  unallocated_only?: string;
};

export function buildFinanceLedgerSearchParams(
  query: FinanceLedgerQueryInput,
) {
  const params = new URLSearchParams({
    page: String(normalizeFinanceLedgerPage(query.page)),
    pageSize: String(normalizeFinanceLedgerPageSize(query.pageSize)),
  });
  appendOptionalParam(params, "project_id", query.project_id);
  appendOptionalParam(params, "direction", query.direction);
  appendOptionalParam(params, "entry_type", query.entry_type);
  appendOptionalParam(params, "cost_category_id", query.cost_category_id);
  appendOptionalParam(params, "unallocated_only", query.unallocated_only);
  return params;
}

export function buildFinanceLedgerPageHref(
  page: number,
  filters: FinanceLedgerPageFilters,
) {
  const params = buildFinanceLedgerSearchParams({
    page,
    pageSize: undefined,
    ...filters,
  });
  params.delete("pageSize");
  return `/finance/ledger?${params}`;
}

export function normalizeFinanceLedgerPage(value: number | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

export function normalizeFinanceLedgerPageSize(value: number | undefined) {
  const pageSize = Number(value || 20);
  if (!Number.isFinite(pageSize) || pageSize <= 0) return 20;
  return Math.min(Math.floor(pageSize), 100);
}

function appendOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}
