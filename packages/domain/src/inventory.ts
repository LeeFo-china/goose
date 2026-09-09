export const INVENTORY_TRANSACTION_TYPE_VALUES = [
  'purchase_receipt',
  'project_issue',
  'project_return',
  'supplier_return',
  'adjustment_in',
  'adjustment_out',
  'transfer_out',
  'transfer_in',
] as const;

export type InventoryTransactionType =
  (typeof INVENTORY_TRANSACTION_TYPE_VALUES)[number];

export const INVENTORY_TRANSACTION_TYPE_LABELS = {
  purchase_receipt: '采购入库',
  project_issue: '项目领料',
  project_return: '项目退料',
  supplier_return: '供应商退货',
  adjustment_in: '库存调增',
  adjustment_out: '库存调减',
  transfer_out: '调拨出库',
  transfer_in: '调拨入库',
} as const satisfies Record<InventoryTransactionType, string>;
