export const WAREHOUSE_ISSUE_STATUS_VALUES = ['draft', 'submitted', 'completed', 'cancelled'] as const;
export const WAREHOUSE_RETURN_STATUS_VALUES = ['draft', 'completed', 'cancelled'] as const;
export type WarehouseIssueStatus = (typeof WAREHOUSE_ISSUE_STATUS_VALUES)[number];
export type WarehouseReturnStatus = (typeof WAREHOUSE_RETURN_STATUS_VALUES)[number];
export type WarehouseMaterialDocumentType = 'issue' | 'return';
export interface WarehouseMaterialSettings { warehouse_materials_enabled: boolean }
export type WarehouseMaterialCommand = 'save_draft' | 'submit' | 'complete' | 'cancel';

export const WAREHOUSE_ISSUE_STATUS_LABELS = {
  draft: '草稿', submitted: '待出库', completed: '已领料', cancelled: '已取消',
} as const satisfies Record<WarehouseIssueStatus, string>;
export const WAREHOUSE_RETURN_STATUS_LABELS = {
  draft: '草稿', completed: '已退料', cancelled: '已取消',
} as const satisfies Record<WarehouseReturnStatus, string>;
export const WAREHOUSE_ISSUE_ACTIONS = {
  draft: ['save_draft', 'submit', 'cancel'], submitted: ['complete', 'cancel'], completed: [], cancelled: [],
} as const satisfies Record<WarehouseIssueStatus, readonly WarehouseMaterialCommand[]>;
export const WAREHOUSE_RETURN_ACTIONS = {
  draft: ['save_draft', 'complete', 'cancel'], completed: [], cancelled: [],
} as const satisfies Record<WarehouseReturnStatus, readonly WarehouseMaterialCommand[]>;

export interface WarehouseIssueDraft {
  expected_version: number;
  warehouse_id: string;
  project_id: string;
  reason?: string | null;
  items: { supplier_sku_id: string; quantity: string }[];
}
export interface WarehouseReturnDraft {
  expected_version: number;
  original_issue_order_id: string;
  reason?: string | null;
  items: { original_issue_item_id: string; quantity: string }[];
}
export interface WarehouseMaterialOrderBase {
  id: string;
  tenant_id: string;
  warehouse_id: string;
  project_id: string;
  order_no: string;
  version: number;
  reason: string | null;
  created_by_employee_id: string;
  updated_by_employee_id: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
}
export interface WarehouseIssueOrder extends WarehouseMaterialOrderBase {
  status: WarehouseIssueStatus;
  submitted_at: string | null;
}
export interface WarehouseReturnOrder extends WarehouseMaterialOrderBase {
  status: WarehouseReturnStatus;
  original_issue_order_id: string;
}
interface WarehouseMaterialSummary {
  warehouse_name: string;
  project_name: string;
  total_amount: string | null;
  item_count: number;
}
export type WarehouseMaterialOrder = WarehouseMaterialSummary & (
  | (WarehouseIssueOrder & { document_type: 'issue'; original_issue_order_no?: null })
  | (WarehouseReturnOrder & { document_type: 'return'; original_issue_order_no: string })
);
export interface WarehouseMaterialItemBase {
  id: string;
  tenant_id: string;
  warehouse_id: string;
  project_id: string;
  line_no: number;
  supplier_sku_id: string;
  sku_name: string;
  sku_code: string;
  quantity: string;
  unit_cost: string | null;
  amount: string | null;
  cost_category_id: string | null;
  cost_category_name: string | null;
  original_issued_quantity: string;
  original_issued_amount: string | null;
  returned_quantity: string;
  returned_amount: string;
  returnable_quantity: string;
}
export interface WarehouseIssueItem extends WarehouseMaterialItemBase { issue_order_id: string }
export interface WarehouseReturnItem extends WarehouseMaterialItemBase {
  return_order_id: string;
  original_issue_order_id: string;
  original_issue_item_id: string;
}
export type WarehouseMaterialCommandResult = {
  status: 'saved' | 'submitted' | 'completed' | 'cancelled';
  order: WarehouseIssueOrder | WarehouseReturnOrder;
};
