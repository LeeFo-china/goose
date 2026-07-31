import type {
  PageData,
} from "@/components/suppliers/supplier-types";

import type {
  RequisitionBudgetStatus,
  RequisitionStatus,
} from "../supplier-purchase-requisitions/requisition-types";

export type { PageData };

export type PurchaseOrderStatus = "draft" | "submitted" | "cancelled";

export type PurchaseOrder = {
  id: string;
  tenant_id: string;
  project_id: string;
  tenant_supplier_id: string;
  supplier_id: string;
  order_no: string;
  status: PurchaseOrderStatus;
  currency: "CNY";
  expected_delivery_date: string | null;
  remark: string | null;
  priced_at: string;
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
  purchase_requisition_id: string | null;
  version: number;
  created_by_employee_id: string;
  updated_by_employee_id: string;
  submitted_by_employee_id: string | null;
  submitted_at: string | null;
  cancelled_by_employee_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrderWithReferences = PurchaseOrder & {
  project: {
    id: string;
    name: string;
    status: string;
  };
  supplier: {
    id: string;
    code: string;
    name: string;
    legal_name: string;
    onboarding_status: string;
    operational_status: string;
  };
  purchase_requisition: {
    id: string;
    request_no: string;
    status: RequisitionStatus;
    budget_status: RequisitionBudgetStatus;
  } | null;
};

export type EditablePurchaseOrder = PurchaseOrderWithReferences & {
  status: "draft";
};

export type PurchaseOrderItem = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  supplier_purchase_order_id: string;
  line_no: number;
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
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrderCatalogItem = {
  supplier_product_id: string;
  product_code: string;
  product_name: string;
  supplier_sku_id: string;
  sku_code: string;
  sku_name: string;
  specification: string | null;
  model: string | null;
  supplier_price_list_id: string;
  price_list_code: string;
  price_list_version: number;
  effective_from: string;
  effective_until: string | null;
  supplier_price_list_item_id: string;
  purchase_unit_id: string;
  purchase_unit_code: string;
  purchase_unit_name: string;
  purchase_unit_symbol: string;
  base_unit_id: string;
  base_unit_code: string;
  base_unit_name: string;
  base_unit_symbol: string;
  base_unit_conversion: string;
  unit_price: string;
  tax_rate: string;
  tax_inclusive: boolean;
};

export type ProjectOption = {
  id: string;
  name: string;
  status: string | null;
};

export type PurchaseOrderSupplierOption = {
  tenant_supplier_id: string;
  supplier_id: string;
  relationship_status: "active";
  default_currency: "CNY";
  supplier: {
    id: string;
    code: string;
    name: string;
    legal_name: string;
  };
};

export type PurchaseOrderDraftLine = {
  supplierSkuId: string;
  quantity: number;
};

export type PurchaseOrderDraftState = {
  projectId: string;
  tenantSupplierId: string;
  expectedVersion: number;
  expectedDeliveryDate?: string | null;
  remark?: string | null;
  lines: PurchaseOrderDraftLine[];
};

export type PurchaseOrderCommandResult = {
  status: "saved" | "submitted" | "cancelled";
  idempotent: boolean;
  purchase_order: PurchaseOrder;
  version: number;
};

export type SupplierPurchaseOrderFinancialSummary = {
  purchase_order_id: string;
  accepted_amount: string;
  payable_amount: string;
  reserved_request_amount: string;
  paid_amount: string;
  open_amount: string;
  available_to_request_amount: string;
};

export type PurchaseOrderPage = PageData<PurchaseOrderWithReferences>;
export type PurchaseOrderItemPage = PageData<PurchaseOrderItem>;
export type PurchaseOrderCatalogPage = PageData<PurchaseOrderCatalogItem>;
