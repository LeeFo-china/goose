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

export interface WarehouseStocktakeOrder {
  id: string;
  tenant_id: string;
  warehouse_id: string;
  order_no: string;
  status: WarehouseStocktakeStatus;
  version: number;
  reason: string;
  created_by_employee_id: string;
  updated_by_employee_id: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

export interface WarehouseStocktakeOrderSummary extends WarehouseStocktakeOrder {
  warehouse_name: string;
  item_count: number;
  counted_count: number;
  difference_count: number;
  gain_amount: string | null;
  loss_amount: string | null;
}

export interface WarehouseStocktakeItem {
  id: string;
  tenant_id: string;
  stocktake_order_id: string;
  warehouse_id: string;
  line_no: number;
  supplier_sku_id: string;
  snapshot_at: string | null;
  book_balance_id: string | null;
  book_balance_version: number | null;
  book_quantity: string | null;
  book_value: string | null;
  book_unit_cost: string | null;
  counted_quantity: string | null;
  difference_reason: string | null;
  difference_quantity: string | null;
  unit_cost: string | null;
  amount: string | null;
  sku_name: string;
  sku_code: string;
}

export interface WarehouseStocktakeSettings { warehouse_stocktakes_enabled: boolean }
export interface WarehouseStocktakeCommandResult {
  status: 'saved' | 'counting' | 'submitted' | 'completed' | 'cancelled';
  order: WarehouseStocktakeOrder;
}
