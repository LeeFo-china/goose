export const WAREHOUSE_ADJUSTMENT_STATUS_VALUES = ['draft', 'submitted', 'completed', 'cancelled'] as const;
export type WarehouseAdjustmentStatus = (typeof WAREHOUSE_ADJUSTMENT_STATUS_VALUES)[number];
export type WarehouseAdjustmentCommand = 'save_draft' | 'submit' | 'complete' | 'cancel';

export const WAREHOUSE_ADJUSTMENT_STATUS_LABELS = {
  draft: '草稿', submitted: '待确认', completed: '已完成', cancelled: '已取消',
} as const satisfies Record<WarehouseAdjustmentStatus, string>;

// 仅用于展示，不替代服务端权限、开关、快照版本和数据库状态检查。
export const WAREHOUSE_ADJUSTMENT_ACTIONS = {
  draft: ['save_draft', 'submit', 'cancel'],
  submitted: ['complete', 'cancel'],
  completed: [],
  cancelled: [],
} as const satisfies Record<WarehouseAdjustmentStatus, readonly WarehouseAdjustmentCommand[]>;

export interface WarehouseAdjustmentDraft {
  expected_version: number;
  warehouse_id: string;
  reason: string;
  items: {
    supplier_sku_id: string;
    quantity_delta: string;
    adjustment_reason: string;
  }[];
}

export interface WarehouseAdjustmentCommandInput {
  expected_version: number;
}
