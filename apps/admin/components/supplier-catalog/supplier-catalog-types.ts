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
  conversion_factor: string;
};

export type CategoryTrailItem = {
  id: string;
  name: string;
};

export type CatalogRecordKind = "category" | "brand" | "unit";

export const catalogStatusMeta = {
  active: { label: "启用", variant: "success" as const },
  inactive: { label: "停用", variant: "secondary" as const },
};

export function formatCatalogDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}
