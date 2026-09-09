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

export interface WarehouseTransferOrder {
  id: string;
  tenant_id: string;
  source_warehouse_id: string;
  destination_warehouse_id: string;
  order_no: string;
  status: WarehouseTransferStatus;
  version: number;
  reason: string;
  created_by_employee_id: string;
  updated_by_employee_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

export interface WarehouseTransferSummary extends WarehouseTransferOrder {
  source_warehouse_name: string;
  destination_warehouse_name: string;
  item_count: number;
  total_amount: string | null;
}

export interface WarehouseTransferItem {
  id: string;
  tenant_id: string;
  transfer_order_id: string;
  source_warehouse_id: string;
  destination_warehouse_id: string;
  line_no: number;
  supplier_sku_id: string;
  quantity: string;
  unit_cost: string | null;
  amount: string | null;
  sku_name: string;
  sku_code: string;
}

export interface WarehouseTransferSettings { warehouse_transfers_enabled: boolean }
export interface WarehouseTransferCommandResult {
  status: 'saved' | 'submitted' | 'completed' | 'cancelled';
  order: WarehouseTransferOrder;
}
