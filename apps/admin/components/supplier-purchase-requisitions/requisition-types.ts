import type { PageData } from "@/components/suppliers/supplier-types";

export type RequisitionStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "cancelled"
  | "converted";

export type RequisitionBudgetStatus =
  | "unchecked"
  | "within_budget"
  | "over_budget";

export type RequisitionRecord = {
  id: string;
  tenant_id: string;
  request_no: string;
  project_id: string;
  tenant_supplier_id: string;
  supplier_id: string;
  status: RequisitionStatus;
  budget_status: RequisitionBudgetStatus;
  currency: "CNY";
  reason: string;
  expected_delivery_date: string | null;
  remark: string | null;
  priced_at: string;
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
  purchase_order_id: string | null;
  version: number;
  created_by_employee_id: string;
  updated_by_employee_id: string;
  submitted_by_employee_id: string | null;
  submitted_at: string | null;
  reviewed_by_employee_id: string | null;
  reviewed_at: string | null;
  review_remark: string | null;
  cancelled_by_employee_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type RequisitionItem = {
  id: string;
  tenant_id: string;
  purchase_requisition_id: string;
  line_no: number;
  cost_category_id: string;
  supplier_product_id: string;
  supplier_sku_id: string;
  supplier_price_list_id: string;
  supplier_price_list_item_id: string;
  product_code_snapshot: string;
  product_name_snapshot: string;
  sku_code_snapshot: string;
  sku_name_snapshot: string;
  specification_snapshot: string | null;
  model_snapshot: string | null;
  purchase_unit_id: string;
  purchase_unit_code_snapshot: string;
  purchase_unit_name_snapshot: string;
  purchase_unit_symbol_snapshot: string;
  base_unit_id: string;
  base_unit_code_snapshot: string;
  base_unit_name_snapshot: string;
  base_unit_symbol_snapshot: string;
  base_unit_conversion: string;
  price_list_code_snapshot: string;
  price_list_version_snapshot: number;
  price_effective_from_snapshot: string;
  price_effective_until_snapshot: string | null;
  quantity: string;
  unit_price: string;
  tax_rate: string;
  tax_inclusive: boolean;
  line_subtotal_amount: string;
  line_tax_amount: string;
  line_total_amount: string;
  created_at: string;
};

export type ProjectCostCommitmentStatus =
  | "reserved"
  | "converted"
  | "released";

export type ProjectCostCommitmentRecord = {
  id: string;
  tenant_id: string;
  project_id: string;
  cost_category_id: string;
  source_type: "supplier_purchase_requisition";
  source_id: string;
  amount: string;
  status: ProjectCostCommitmentStatus;
  budget_amount_snapshot: string;
  expense_amount_snapshot: string;
  other_commitment_amount_snapshot: string;
  available_amount_snapshot: string;
  created_by_employee_id: string;
  released_by_employee_id: string | null;
  released_at: string | null;
  release_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type RequisitionDetail = {
  requisition: RequisitionRecord;
  budget_snapshots: ProjectCostCommitmentRecord[];
};

export type RequisitionPage = PageData<RequisitionRecord>;
export type RequisitionItemPage = PageData<RequisitionItem>;

export type RequisitionDraftItemInput = {
  supplier_sku_id: string;
  cost_category_id: string;
  quantity: string;
};

export type RequisitionDraftInput = {
  project_id: string;
  tenant_supplier_id: string;
  expected_version: number;
  reason: string;
  expected_delivery_date?: string | null;
  remark?: string | null;
  items: RequisitionDraftItemInput[];
};

export type RequisitionSubmitInput = {
  expected_version: number;
};

export type RequisitionReviewInput = {
  expected_version: number;
  action: "approve" | "reject";
  remark?: string | null;
};

export type RequisitionCancelInput = {
  expected_version: number;
  reason: string;
};

export type RequisitionConvertInput = {
  expected_version: number;
};

type RequisitionCommandBase = {
  idempotent: boolean;
  requisition: RequisitionRecord;
  version: number;
};

export type RequisitionCommandResult =
  | (RequisitionCommandBase & {
    status:
      | "saved"
      | "submitted"
      | "approved"
      | "rejected"
      | "cancelled";
    purchase_order_id?: never;
  })
  | (RequisitionCommandBase & {
    status: "converted";
    purchase_order_id: string;
  });

export type RequisitionAction =
  | "edit"
  | "submit"
  | "approve"
  | "reject"
  | "convert"
  | "cancel";

export type RequisitionActionContext = {
  status: RequisitionStatus;
  budgetStatus: RequisitionBudgetStatus;
  currentEmployeeId: string | null;
  requesterEmployeeId: string;
  canManage: boolean;
  canApprove: boolean;
  canManageBudget: boolean;
};
