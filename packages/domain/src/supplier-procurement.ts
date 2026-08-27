export const SUPPLIER_PURCHASABLE_PRODUCT_STATUS_VALUES = [
  "created",
  "validation_error",
  "state_conflict",
] as const;

export type SupplierPurchasableProductStatus =
  (typeof SUPPLIER_PURCHASABLE_PRODUCT_STATUS_VALUES)[number];
