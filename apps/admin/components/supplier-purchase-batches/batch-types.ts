import type {
  PurchaseOrderCatalogItem,
  PurchaseOrderWithReferences,
} from "@/components/supplier-purchase-orders/purchase-order-types";
import type {
  PageData,
  TenantSupplierSettings,
} from "@/components/suppliers/supplier-types";

export type { PageData };
export type BatchStatus =
  | "draft"
  | "pending_approval"
  | "rejected"
  | "cancelled"
  | "ordered";
export type DestinationType = "project" | "warehouse";
export type BatchDestination = {
  destination_type: DestinationType;
  project_id: string | null;
  warehouse_id: string | null;
};
export type NamedOption = { id: string; name: string; status?: string | null };
export type WarehouseOption = NamedOption & {
  is_default: boolean;
  status: string;
};
export type BatchSettings =
  & Pick<
    TenantSupplierSettings,
    "module_enabled" | "purchase_batch_workflow_enabled"
  >
  & { warehouse_procurement_enabled: boolean };
export type BatchAccess = {
  canView: boolean;
  canManage: boolean;
  canReadSettings: boolean;
  canViewWarehouses: boolean;
  canManageWarehouses: boolean;
  canViewOrders: boolean;
};
export type BatchActions = {
  can_edit: boolean;
  can_submit: boolean;
  can_review: boolean;
  can_withdraw: boolean;
  can_cancel: boolean;
};
export type BatchReviewerAction = {
  key: string;
  label: string;
  business_action: string;
  requires_reason: boolean;
  disabled: boolean;
  disabled_reason?: string;
  blocked_reason?: string;
};
export type BatchWorkflowState = {
  instance_status: string;
  current_node_title: string | null;
  pending_task_count: number;
  actions: BatchReviewerAction[];
};
export type BatchPerson = { employee_id: string; name: string };
export type BatchRecord = BatchDestination & {
  id: string;
  batch_no: string;
  status: BatchStatus;
  version: number;
  reason: string;
  remark: string | null;
  expected_delivery_date: string | null;
  currency: "CNY";
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
  budget_status:
    | "unchecked"
    | "within_budget"
    | "over_budget"
    | "not_applicable";
  supplier_count: number;
  item_count: number;
  split_generation: number;
  priced_at: string;
  updated_at: string;
  submitted_at: string | null;
};
export type BatchDetail = BatchRecord & {
  project: NamedOption | null;
  warehouse: NamedOption | null;
  actions?: BatchActions;
  workflow_state?: BatchWorkflowState | null;
  creator: BatchPerson | null;
  applicant: BatchPerson | null;
  approval_summary?: {
    current_approvers: BatchPerson[];
    review_remark: string | null;
  };
};
export type BatchItem = {
  id: string;
  line_no: number;
  supplier_sku_id: string;
  supplier_id: string;
  supplier_name_snapshot: string;
  product_name_snapshot: string;
  sku_name_snapshot: string;
  sku_code_snapshot: string;
  quantity: string;
  purchase_unit_name_snapshot: string;
  cost_category_id: string;
  unit_price: string;
  line_total_amount: string;
};
export type BatchCatalogItem = PurchaseOrderCatalogItem & {
  category_id: string;
  category_name: string;
  brand_id: string;
  brand_name: string;
  tenant_supplier_id: string;
  supplier_id: string;
  supplier_name: string;
  currency: "CNY";
  purchasable_status: "purchasable";
  default_cost_category_id: string | null;
  default_cost_category_name: string | null;
  cost_category_source: "product" | "category" | "ancestor" | null;
};
export type BatchLine = {
  supplier_sku_id: string;
  quantity: string;
  cost_category_id: string;
  supplier_id: string;
  name: string;
  category_name?: string;
  supplier_name?: string;
  sku_code?: string;
  unit_price?: string;
  purchase_unit_name?: string;
};
export type BatchDraft = BatchDestination & {
  reason: string;
  remark: string;
  expected_delivery_date: string;
  lines: BatchLine[];
};
export type BatchSavePayload = BatchDestination & {
  expected_version: number;
  reason: string;
  remark: string | null;
  expected_delivery_date: string | null;
  items: {
    supplier_sku_id: string;
    quantity: string;
    cost_category_id?: string;
  }[];
};
export type SplitPreview = {
  tenant_supplier_id: string;
  supplier_id: string;
  supplier_name: string;
  item_count: number;
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
};
export type BatchCommandKind =
  | "save-draft"
  | "submit"
  | "review"
  | "withdraw"
  | "cancel";
export type BatchCommandPayload = BatchSavePayload | {
  expected_version: number;
  action?: "approve" | "reject";
  reason?: string;
  remark?: string | null;
};
export type BatchCommandResult = {
  status: string;
  idempotent: boolean;
  batch: BatchRecord;
  version: number;
  split_preview?: SplitPreview[];
  workflow_state?: Pick<
    BatchWorkflowState,
    "instance_status" | "current_node_title" | "pending_task_count"
  >;
};
export type BatchRequisition = BatchDestination & {
  id: string;
  request_no: string;
  status: string;
  total_amount: string;
  purchase_batch_id: string;
  split_generation: number;
};
export type BatchOrder = PurchaseOrderWithReferences & {
  purchase_batch_id: string;
};
