import type {
  SupplierPaymentMethod,
  SupplierPaymentRequestStatus,
} from "@gooes/domain";

import type { PageData } from "@/components/suppliers/supplier-types";

export type { SupplierPaymentMethod, SupplierPaymentRequestStatus };

export type SupplierPaymentRequestListItem = {
  id: string;
  project_id: string;
  tenant_supplier_id: string;
  supplier_id: string;
  supplier_name: string;
  request_no: string;
  status: SupplierPaymentRequestStatus;
  currency: "CNY";
  requested_amount: string;
  paid_amount: string;
  reason: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type SupplierPaymentRequest = {
  id: string;
  tenant_id: string;
  project_id: string;
  tenant_supplier_id: string;
  supplier_id: string;
  request_no: string;
  status: SupplierPaymentRequestStatus;
  currency: "CNY";
  requested_amount: string;
  paid_amount: string;
  reason: string;
  remark: string | null;
  version: number;
  submitted_by_employee_id: string | null;
  submitted_at: string | null;
  reviewed_by_employee_id: string | null;
  reviewed_at: string | null;
  review_remark: string | null;
  cancelled_by_employee_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  closed_by_employee_id: string | null;
  closed_at: string | null;
  close_reason: string | null;
  created_by_employee_id: string;
  updated_by_employee_id: string;
  created_at: string;
  updated_at: string;
};

export type SupplierPaymentRequestDetailAllocation = {
  id: string;
  payable_event_id: string;
  requested_amount: string;
  paid_amount: string;
  payable_amount: string;
  due_at: string;
  supplier_purchase_order_id: string;
  receipt_id: string;
  receipt_item_id: string;
  invoice_required_before_payment: boolean;
};

export type SupplierPaymentRequestDetail = {
  payment_request: SupplierPaymentRequest;
  allocations: SupplierPaymentRequestDetailAllocation[];
};

export type SupplierPaymentListItem = {
  id: string;
  payment_no: string;
  amount: string;
  currency: "CNY";
  payment_method: SupplierPaymentMethod;
  payment_reference: string;
  paid_at: string;
  evidence_images: string[];
  remark: string | null;
  confirmed_by_employee_id: string;
  created_at: string;
};

export type SupplierPaymentRequestPage =
  PageData<SupplierPaymentRequestListItem>;
export type SupplierPaymentPage = PageData<SupplierPaymentListItem>;

export type SupplierPaymentRequestListQuery = {
  page: number;
  pageSize: number;
  project_id?: string;
  tenant_supplier_id?: string;
  status?: SupplierPaymentRequestStatus;
  keyword?: string;
  created_from?: string;
  created_to?: string;
};

export type SupplierPaymentRequestDraftAllocationInput = {
  payable_event_id: string;
  requested_amount: string;
};

type SupplierPaymentRequestDraftFields = {
  id: string;
  project_id: string;
  tenant_supplier_id: string;
  reason: string;
  remark?: string | null;
  allocations: SupplierPaymentRequestDraftAllocationInput[];
};

export type SupplierPaymentRequestDraftInput =
  SupplierPaymentRequestDraftFields & {
    expected_version: 0;
  };

export type SupplierPaymentRequestUpdateDraftInput =
  SupplierPaymentRequestDraftFields & {
    expected_version: number;
  };

export type SupplierPaymentRequestSubmitInput = {
  expected_version: number;
};
export type SupplierPaymentRequestReviewInput = {
  expected_version: number;
  remark?: string | null;
};
export type SupplierPaymentRequestRejectInput = {
  expected_version: number;
  remark: string;
};
export type SupplierPaymentRequestReasonInput = {
  expected_version: number;
  reason: string;
};

export type SupplierPaymentAllocationInput = {
  payment_request_allocation_id: string;
  payable_event_id: string;
  amount: string;
};

export type SupplierPaymentConfirmInput = {
  id: string;
  expected_version: number;
  payment_method: SupplierPaymentMethod;
  payment_reference: string;
  paid_at: string;
  evidence_images: string[];
  remark?: string | null;
  allocations: SupplierPaymentAllocationInput[];
};

export type SupplierPayment = {
  id: string;
  tenant_id: string;
  project_id: string;
  tenant_supplier_id: string;
  supplier_id: string;
  payment_request_id: string;
  payment_no: string;
  currency: "CNY";
  amount: string;
  payment_method: SupplierPaymentMethod;
  payment_reference: string;
  paid_at: string;
  evidence_images: string[];
  remark: string | null;
  confirmed_by_employee_id: string;
  idempotency_key: string;
  created_at: string;
};

export type SupplierPaymentCommandResult = {
  status:
    | "saved"
    | "submitted"
    | "approved"
    | "rejected"
    | "cancelled"
    | "closed";
  idempotent: boolean;
  payment_request: SupplierPaymentRequest;
  version: number;
} | {
  status: "partially_paid" | "paid";
  idempotent: boolean;
  payment_request: SupplierPaymentRequest;
  payment: SupplierPayment;
  version: number;
};

export type PaymentRequestAction =
  | "edit"
  | "submit"
  | "approve"
  | "reject"
  | "cancel"
  | "pay"
  | "close";

export type PaymentRequestPermissions = {
  canManage: boolean;
  canApprove: boolean;
  canPay: boolean;
};

export type PaymentRequestActionContext = {
  status: SupplierPaymentRequestStatus;
  invoiceBlocked: boolean | null;
};
