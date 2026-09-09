export const WAREHOUSE_STOCKTAKE_STATUS_VALUES = [
  'draft', 'counting', 'submitted', 'completed', 'cancelled',
] as const;
export type WarehouseStocktakeStatus = (typeof WAREHOUSE_STOCKTAKE_STATUS_VALUES)[number];
export type WarehouseStocktakeCommand =
  | 'save_draft'
  | 'start'
  | 'record_counts'
  | 'submit'
  | 'complete'
  | 'cancel';

export const WAREHOUSE_STOCKTAKE_STATUS_LABELS = {
  draft: '草稿', counting: '盘点中', submitted: '待确认', completed: '已完成', cancelled: '已取消',
} as const satisfies Record<WarehouseStocktakeStatus, string>;

// 仅用于展示，不替代服务端权限、开关、快照版本和数据库状态检查。
export const WAREHOUSE_STOCKTAKE_ACTIONS = {
  draft: ['save_draft', 'start', 'cancel'],
  counting: ['record_counts', 'submit', 'cancel'],
  submitted: ['complete', 'cancel'],
  completed: [],
  cancelled: [],
} as const satisfies Record<WarehouseStocktakeStatus, readonly WarehouseStocktakeCommand[]>;

export interface WarehouseStocktakeDraft {
  expected_version: number;
  warehouse_id: string;
  reason: string;
  items: { supplier_sku_id: string }[];
}

export interface WarehouseStocktakeCountsInput {
  expected_version: number;
  items: {
    supplier_sku_id: string;
    counted_quantity: string;
    difference_reason?: string | null;
  }[];
}

export interface WarehouseStocktakeCommandInput {
  expected_version: number;
}
