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
  category_id: string | null;
  category?: Pick<CatalogCategory, "id" | "code" | "name"> & {
    full_name?: string;
    status?: CatalogStatus;
  } | null;
  legal_name: string | null;
  logo_file_id: string | null;
};

export type CatalogUnit = CatalogRecord & {
  symbol: string;
  base_unit_id: string | null;
  base_unit: CatalogBaseUnit | null;
  conversion_factor: string;
  unit_dimension: string;
};

export type CatalogBaseUnit = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  unit_dimension?: string;
  status: CatalogStatus;
};

export type CatalogSpecValueType =
  | "text"
  | "number"
  | "boolean"
  | "single_enum"
  | "multi_enum"
  | "date";

export type CatalogSpecDefinition = CatalogRecord & {
  category_id: string;
  value_type: CatalogSpecValueType;
  enum_options: string[];
  unit_dimension: string | null;
  is_required: boolean;
  participates_in_sku_name: boolean;
  is_filterable: boolean;
  ownership_scope: "platform" | "tenant";
  owner_tenant_id: string | null;
  source_platform_spec_id: string | null;
};

export type CatalogUnitSuggestion = {
  id: string;
  tenant_id: string;
  suggested_code: string;
  suggested_name: string;
  suggested_symbol: string;
  unit_dimension: string;
  reason: string | null;
  status: "submitted" | "approved" | "rejected";
  version: number;
  reviewed_at: string | null;
  review_remark: string | null;
  approved_catalog_unit_id: string | null;
  created_at: string;
  updated_at: string;
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
