import type {
  SupplierPriceListStatus,
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
};

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
  category: CatalogReference;
  brand: CatalogReference;
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
  purchase_unit_id: string;
  base_unit_id: string;
  base_unit_conversion: string;
  batch_managed: boolean;
  color_managed: boolean;
  serial_managed: boolean;
  status: SupplierSkuStatus;
  version: number;
  purchase_unit: UnitReference;
  base_unit: UnitReference;
  updated_at: string;
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
};

export type SupplierProductPage = PageData<SupplierProduct>;
export type SupplierSkuPage = PageData<SupplierSku>;
export type SupplierPriceListPage = PageData<SupplierPriceList>;
export type SupplierPriceItemPage = PageData<SupplierPriceListItem>;
