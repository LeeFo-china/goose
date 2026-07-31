import type { PageData } from "@/components/suppliers/supplier-types";

export type SupplierPayableStatus =
  | "open"
  | "reserved"
  | "partially_paid"
  | "paid"
  | "overdue";

export type SupplierPayableFacts = {
  id: string;
  project_id: string;
  tenant_supplier_id: string;
  supplier_id: string;
  supplier_purchase_order_id: string;
  receipt_id: string;
  receipt_item_id: string;
  project_name: string;
  supplier_name: string;
  purchase_order_no: string;
  receipt_no: string;
  invoice_required_before_payment: boolean;
  amount: string;
  paid_amount: string;
  reserved_amount: string;
  open_amount: string;
  currency: "CNY";
  occurred_at: string;
  due_at: string;
  status: SupplierPayableStatus;
};

export type SupplierPayable = SupplierPayableFacts & {
  available_to_request_amount: string;
};

export type SupplierPayablePage = PageData<SupplierPayable>;

export type SupplierPayableFilterOptionType =
  | "project"
  | "supplier"
  | "purchase_order";

export type SupplierPayableFilterOption = {
  id: string;
  label: string;
};

export type SupplierPayableFilterOptionPage =
  PageData<SupplierPayableFilterOption>;

export type SupplierPayableListQuery = {
  page: number;
  pageSize: number;
  project_id?: string;
  tenant_supplier_id?: string;
  purchase_order_id?: string;
  status?: SupplierPayableStatus;
  due_from?: string;
  due_to?: string;
};
