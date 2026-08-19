export const SUPPLIER_PRODUCT_STATUS_VALUES = [
  "draft",
  "active",
  "inactive",
] as const;

export type SupplierProductStatus =
  (typeof SUPPLIER_PRODUCT_STATUS_VALUES)[number];

export const SUPPLIER_PRODUCT_SOURCE_VALUES = [
  "platform_shared",
  "tenant_private",
] as const;

export type SupplierProductSource =
  (typeof SUPPLIER_PRODUCT_SOURCE_VALUES)[number];

export const SUPPLIER_SKU_STATUS_VALUES = [
  "draft",
  "active",
  "inactive",
] as const;

export type SupplierSkuStatus = (typeof SUPPLIER_SKU_STATUS_VALUES)[number];

export const SUPPLIER_PRICE_LIST_STATUS_VALUES = [
  "draft",
  "published",
  "retired",
] as const;

export type SupplierPriceListStatus =
  (typeof SUPPLIER_PRICE_LIST_STATUS_VALUES)[number];

export const SUPPLIER_PRICE_LIST_ACTION_VALUES = [
  "publish",
  "new-version",
  "retire",
] as const;

export type SupplierPriceListAction =
  (typeof SUPPLIER_PRICE_LIST_ACTION_VALUES)[number];

export const isSupplierPriceListAction = (
  value: string,
): value is SupplierPriceListAction =>
  SUPPLIER_PRICE_LIST_ACTION_VALUES.includes(
    value as SupplierPriceListAction,
  );
