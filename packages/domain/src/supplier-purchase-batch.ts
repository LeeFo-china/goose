export const SUPPLIER_PURCHASE_BATCH_STATUS_VALUES = [
  "draft",
  "pending_approval",
  "rejected",
  "cancelled",
  "ordered",
] as const;

export const SUPPLIER_PURCHASE_BATCH_COMMAND_STATUS_VALUES = [
  "saved",
  "submitted",
  "rejected",
  "cancelled",
  "ordered",
  "revision_required",
] as const;

export type SupplierPurchaseBatchStatus =
  (typeof SUPPLIER_PURCHASE_BATCH_STATUS_VALUES)[number];

export type SupplierPurchaseBatchCommandStatus =
  (typeof SUPPLIER_PURCHASE_BATCH_COMMAND_STATUS_VALUES)[number];
