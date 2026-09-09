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
  "withdrawn",
] as const;

export const SUPPLIER_PURCHASE_BATCH_COMMAND_TYPE_VALUES = [
  "save_draft",
  "submit",
  "review",
  "cancel",
  "withdraw",
] as const;

export const SUPPLIER_PURCHASE_PURPOSE_PRESETS = {
  project: ["项目备料", "现场补料"],
  warehouse: ["仓库补货"],
} as const satisfies Record<"project" | "warehouse", readonly string[]>;

export type SupplierPurchaseBatchStatus =
  (typeof SUPPLIER_PURCHASE_BATCH_STATUS_VALUES)[number];

export type SupplierPurchaseBatchCommandStatus =
  (typeof SUPPLIER_PURCHASE_BATCH_COMMAND_STATUS_VALUES)[number];

export type SupplierPurchaseBatchCommandType =
  (typeof SUPPLIER_PURCHASE_BATCH_COMMAND_TYPE_VALUES)[number];

export type SupplierPurchasePurposePreset =
  (typeof SUPPLIER_PURCHASE_PURPOSE_PRESETS)[keyof typeof SUPPLIER_PURCHASE_PURPOSE_PRESETS][number];
