export type TenantCatalogView = "categories" | "brands" | "units";
export type TenantCatalogSource = "platform" | "tenant";

export type TenantCatalogPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type TenantCatalogPage<RecordType> = {
  list: RecordType[];
  pagination: TenantCatalogPagination;
};

type TenantCatalogRecord = {
  id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
  sort_order: number;
  version: number;
  ownership_scope: TenantCatalogSource;
  owner_tenant_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantCatalogCategory = TenantCatalogRecord & {
  parent_id: string | null;
  full_name: string | null;
  level: number;
  is_leaf: boolean;
  mapped_platform_category_id: string | null;
};

export type TenantCatalogBrand = TenantCatalogRecord & {
  legal_name: string | null;
  logo_file_id: string | null;
  mapped_platform_brand_id: string | null;
};

export type TenantCatalogUnit = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  status: "active" | "inactive";
  sort_order: number;
  version: number;
  base_unit_id: string | null;
  conversion_factor: string;
  created_at: string;
  updated_at: string;
};

export function catalogSourceLabel(source: TenantCatalogSource): string {
  return source === "platform" ? "平台共享" : "租户私有";
}
