import type {
  CatalogSpecValue,
  CatalogSpecValueType,
  SupplierPriceListStatus,
  SupplierProductSource,
  SupplierProductStatus,
  SupplierSkuStatus,
} from "@gooes/domain";

import type {
  PageData,
  TenantSupplierRelationship,
} from "@/components/suppliers/supplier-types";

export type { PageData, TenantSupplierRelationship };

export type CatalogReference = {
  id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
  parent_id?: string | null;
  full_name?: string;
};

export type OwnershipScope = "platform" | "tenant";
export type SupplierCostCategorySource = "product" | "category" | "ancestor";

export type UnitReference = CatalogReference & {
  symbol: string;
};

export type SupplierProduct = {
  id: string;
  supplier_id: string;
  product_code: string;
  name: string;
  description: string | null;
  status: SupplierProductStatus;
  version: number;
  ownership_scope: OwnershipScope;
  owner_tenant_id: string | null;
  category: CatalogReference;
  brand: CatalogReference;
  sku_count: number;
  active_sku_count: number;
  default_cost_category_id: string | null;
  default_cost_category_name: string | null;
  cost_category_source: SupplierCostCategorySource | null;
  updated_at: string;
};

export type SupplierSku = {
  id: string;
  supplier_id: string;
  supplier_product_id: string;
  sku_code: string;
  name: string;
  specification: string | null;
  model: string | null;
  spec_values: Record<string, CatalogSpecValue> | null;
  purchase_unit_id: string;
  base_unit_id: string;
  base_unit_conversion: string;
  batch_managed: boolean;
  color_managed: boolean;
  serial_managed: boolean;
  status: SupplierSkuStatus;
  version: number;
  ownership_scope: OwnershipScope;
  owner_tenant_id: string | null;
  purchase_unit: UnitReference;
  base_unit: UnitReference;
  current_price?: SupplierSkuCurrentPrice | null;
  updated_at: string;
};

export type SupplierSkuCurrentPrice = {
  supplier_price_list_id: string;
  supplier_price_list_version: number;
  supplier_price_list_row_version: number;
  supplier_price_list_item_id: string;
  unit_price: string;
  tax_rate: string;
  tax_inclusive: boolean;
  effective_from: string;
  effective_until: string | null;
};

export type SupplierSkuPriceContext = {
  currency: "CNY";
  recommended_tax_rate: string;
  recommended_tax_inclusive: false;
  next_scheduled_effective_from: string | null;
  current_price: SupplierSkuCurrentPrice | null;
};

export type SupplierPriceList = {
  id: string;
  supplier_id: string;
  price_list_code: string;
  version_number: number;
  scope_type: "default";
  name: string;
  currency: string;
  lifecycle_status: SupplierPriceListStatus;
  effective_from: string;
  effective_until: string | null;
  supersedes_price_list_id: string | null;
  published_at: string | null;
  row_version: number;
  updated_at: string;
};

export type SupplierPriceListItem = {
  id: string;
  supplier_id: string;
  supplier_price_list_id: string;
  supplier_sku_id: string;
  minimum_quantity: string;
  maximum_quantity: string | null;
  purchase_unit_id: string;
  base_unit_id: string;
  base_unit_conversion: string;
  unit_price: string;
  tax_rate: string;
  tax_inclusive: boolean;
  sku: Pick<SupplierSku, "id" | "sku_code" | "name" | "status">;
  purchase_unit: UnitReference;
  base_unit: UnitReference;
  updated_at: string;
};

export type SupplierCommandResult = {
  status: string;
  idempotent?: boolean;
  version?: number;
  current_status?: string;
  error_code?: string;
  product?: Record<string, unknown>;
  sku?: Record<string, unknown>;
  price_list?: Record<string, unknown>;
  item?: Record<string, unknown>;
};

export type CatalogOption = {
  id: string;
  code: string;
  name: string;
  symbol?: string;
  full_name?: string;
  unit_dimension?: string;
  ownership_scope?: OwnershipScope;
  owner_tenant_id?: string | null;
};

export type UnitOption = CatalogOption & {
  symbol: string;
  unit_dimension: string;
};

export type CatalogSpecDefinition = {
  id: string;
  category_id: string;
  code: string;
  name: string;
  value_type: CatalogSpecValueType;
  enum_options: string[];
  unit_dimension: string | null;
  is_required: boolean;
  participates_in_sku_name: boolean;
  is_filterable: boolean;
  sort_order: number;
  status: "active" | "inactive";
  ownership_scope: OwnershipScope;
  owner_tenant_id: string | null;
};

export type SupplierSkuUnitConversionInput = {
  from_unit_id: string;
  to_unit_id: string;
  factor: string;
};

export type SupplierSkuUnitConversion = SupplierSkuUnitConversionInput & {
  from_unit: UnitOption;
  to_unit: UnitOption;
};

export type ProductApiScope =
  | { kind: "tenant"; tenantSupplierId: string }
  | { kind: "platform"; supplierId: string };

export type PlatformSupplierOption = {
  id: string;
  code: string;
  name: string;
  onboarding_status: string;
  operational_status: string;
};

export type { SupplierProductSource };

export type SupplierProductPage = PageData<SupplierProduct>;
export type SupplierSkuPage = PageData<SupplierSku>;
export type SupplierPriceListPage = PageData<SupplierPriceList>;
export type SupplierPriceItemPage = PageData<SupplierPriceListItem>;
