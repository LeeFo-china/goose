export type CatalogView = "categories" | "brands" | "units";
export type CatalogStatus = "active" | "inactive";

export type CatalogPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CatalogPage<RecordType> = {
  list: RecordType[];
  pagination: CatalogPagination;
};

type CatalogRecord = {
  id: string;
  code: string;
  name: string;
  status: CatalogStatus;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
};

export type CatalogCategory = CatalogRecord & {
  parent_id: string | null;
  level: number;
};

export type CatalogBrand = CatalogRecord & {
  legal_name: string | null;
  logo_file_id: string | null;
};

export type CatalogUnit = CatalogRecord & {
  symbol: string;
  base_unit_id: string | null;
  base_unit: CatalogBaseUnit | null;
  conversion_factor: string;
};

export type CatalogBaseUnit = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  status: CatalogStatus;
};

export type CategoryReturnState = {
  page: number;
  pageSize: number;
  keyword: string;
  status: CatalogStatus | "";
};

export type CategoryTrailItem = {
  id: string;
  name: string;
  returnState?: CategoryReturnState;
};

export type CatalogRecordKind = "category" | "brand" | "unit";

export type CatalogCreateIntent = {
  key: string;
  fingerprint: string;
};

export const catalogStatusMeta = {
  active: { label: "启用", variant: "success" as const },
  inactive: { label: "停用", variant: "secondary" as const },
};

export function formatCatalogDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}
