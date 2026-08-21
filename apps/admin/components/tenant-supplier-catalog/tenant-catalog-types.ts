import type {
  CatalogBrand,
  CatalogCategory,
  CategoryReturnState,
  CatalogUnit,
} from "@/components/supplier-catalog/supplier-catalog-types";

export type CatalogOwnershipScope = "platform" | "tenant";

export type TenantCatalogCategory = CatalogCategory & {
  full_name: string;
  is_leaf: boolean;
  mapped_platform_category_id: string | null;
  mapped_platform_category?: {
    id: string;
    code: string;
    name: string;
    full_name: string;
    status: "active" | "inactive";
  } | null;
  ownership_scope: CatalogOwnershipScope;
  owner_tenant_id: string | null;
};

export type TenantCatalogBrand = CatalogBrand & {
  mapped_platform_brand_id: string | null;
  mapped_platform_brand?: {
    id: string;
    code: string;
    name: string;
    status: "active" | "inactive";
  } | null;
  ownership_scope: CatalogOwnershipScope;
  owner_tenant_id: string | null;
};

export type TenantCatalogUnit = CatalogUnit & {
  unit_dimension: string;
};

export type TenantCatalogView =
  | "categories"
  | "brands"
  | "units"
  | "unit-suggestions";

export type UnitSuggestionStatus = "submitted" | "approved" | "rejected";

export type TenantCategoryTrailItem = {
  id: string;
  name: string;
  ownershipScope: CatalogOwnershipScope;
  level: number;
  returnState?: CategoryReturnState;
};

export type CatalogMappingOption = {
  id: string;
  code: string;
  name: string;
};
