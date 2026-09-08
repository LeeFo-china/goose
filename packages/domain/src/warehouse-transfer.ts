export const WAREHOUSE_TRANSFER_STATUS_VALUES = ['draft', 'submitted', 'completed', 'cancelled'] as const;
export type WarehouseTransferStatus = (typeof WAREHOUSE_TRANSFER_STATUS_VALUES)[number];
export type WarehouseTransferCommand = 'save_draft' | 'submit' | 'complete' | 'cancel';

export const WAREHOUSE_TRANSFER_STATUS_LABELS = {
  draft: '草稿', submitted: '待调拨', completed: '已调拨', cancelled: '已取消',
} as const satisfies Record<WarehouseTransferStatus, string>;

// 展示契约，不替代服务端权限、开关和数据库状态检查。
export const WAREHOUSE_TRANSFER_ACTIONS = {
  draft: ['save_draft', 'submit', 'cancel'],
  submitted: ['complete', 'cancel'],
  completed: [],
  cancelled: [],
} as const satisfies Record<WarehouseTransferStatus, readonly WarehouseTransferCommand[]>;

export interface WarehouseTransferDraft {
  expected_version: number;
  source_warehouse_id: string;
  destination_warehouse_id: string;
  reason: string;
  items: { supplier_sku_id: string; quantity: string }[];
}

export interface WarehouseTransferCommandInput {
  expected_version: number;
}
