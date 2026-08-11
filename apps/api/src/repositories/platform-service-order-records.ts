export {
  buildIlikePattern,
  normalizePagination,
  pageResult,
} from "./platform-service-order-pagination";

export type ProductVersionRecord = {
  id: string;
  version: number;
  title: string;
  term_years: number;
  list_amount_fen: number;
  amount_fen: number;
  service_scope: string[];
  terms_version: number;
  terms_content: string;
};

export type ProductRecord = {
  id: string;
  code: string;
  status: "draft" | "enabled" | "disabled" | "archived";
  published_version_id: string | null;
  published_version: ProductVersionRecord | ProductVersionRecord[] | null;
};

export type PlatformProductRecord = ProductRecord & {
  title: string;
  term_years: number;
  list_amount_fen: number;
  amount_fen: number;
  service_scope: string[];
  terms_version: number;
  terms_content: string;
  version: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type OrderRecord = {
  id: string;
  tenant_id?: string;
  order_no: string;
  out_trade_no?: string;
  product_id?: string;
  product_version_id?: string;
  product_code: string;
  term_years: number;
  amount_fen: number;
  paid_amount_fen?: number | null;
  payment_status: string;
  service_status: string;
  payment_config_id?: string;
  payment_config_guard_version?: number;
  payer_openid?: string;
  product_snapshot?: Record<string, unknown>;
  transaction_id?: string | null;
  service_access_terminated_at?: string | null;
  service_access_termination_reason?: string | null;
  source_trial_id?: string | null;
  prepay_id: string | null;
  payment_expires_at: string;
  paid_at: string | null;
  closed_at: string | null;
  terms_version: number;
  version: number;
  created_at: string;
  updated_at: string;
};

export type CreatePendingOrderInput = {
  tenantId: string;
  productId: string;
  productVersionId: string;
  orderNo: string;
  outTradeNo: string;
  idempotencyKey: string;
  productCode: string;
  pricingVersion: number;
  productSnapshot: Record<string, unknown>;
  termYears: number;
  amountFen: number;
  paymentConfigId: string;
  paymentConfigGuardVersion: number;
  payerOpenid: string;
  paymentExpiresAt: string;
  termsVersion: number;
  termsAcceptedAt: string;
  createdByEmployeeId: string;
  sourceTrialId?: string;
};

export type ProductDraftCreateInput = {
  code: string;
  title: string;
  termYears: number;
  listAmountFen: number;
  amountFen: number;
  serviceScope: string[];
  termsContent: string;
  employeeId: string;
};

export type ProductDraftUpdateInput = Partial<ProductDraftCreateInput> & {
  productId: string;
  expectedVersion: number;
  employeeId: string;
  termsVersion?: number;
};

export type ProductPublishInput = {
  productId: string;
  expectedVersion: number;
  title: string;
  termYears: number;
  listAmountFen: number;
  amountFen: number;
  serviceScope: string[];
  termsVersion: number;
  termsContent: string;
  employeeId: string;
};

export type NotificationCreateInput = {
  notifyId: string;
  tenantId: string | null;
  orderId: string | null;
  outTradeNo: string | null;
  transactionId: string | null;
  payload: Record<string, unknown>;
};

export type ConfirmPaymentInput = {
  orderId: string;
  transactionId: string;
  paidAmountFen: number;
  paidAt: string | null;
  notificationId: string | null;
  metadata: Record<string, unknown>;
};

export type RefundRequestCreateInput = {
  tenantId: string;
  orderId: string;
  idempotencyKey: string;
  reason: string;
  createdByEmployeeId: string;
};

export type RefundReviewInput = RefundRequestCreateInput & {
  expectedVersion: number;
};

export type RefundReviewResult = {
  idempotent: boolean;
  refundRequest: RefundRequestRecord | null;
  order: OrderRecord | null;
  errorCode?: string;
};

export type RefundRequestRecord = {
  id: string;
  tenant_id: string;
  service_order_id: string;
  idempotency_key: string;
  reason: string;
  status: string;
  version?: number;
  created_by_employee_id: string;
  reviewed_by_employee_id?: string | null;
  reviewed_at?: string | null;
  review_remark?: string | null;
  out_refund_no?: string | null;
  wechat_refund_id?: string | null;
  refund_amount_fen?: number | null;
  refunded_at?: string | null;
  refunded_by_employee_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type FulfillmentAttachmentRecord = {
  id: string;
  file_id: string;
  file_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  file?: {
    id: string;
    original_name: string | null;
    mime_type: string | null;
    size_bytes: number | null;
  } | Array<{
    id: string;
    original_name: string | null;
    mime_type: string | null;
    size_bytes: number | null;
  }> | null;
  created_at: string;
};

export type FulfillmentRecordRecord = {
  id: string;
  tenant_id: string;
  service_order_id: string;
  work_order_id: string;
  record_type: string;
  title: string;
  content: string;
  occurred_at: string;
  created_by_employee_id: string;
  created_at: string;
  updated_at: string;
  attachments?: FulfillmentAttachmentRecord[] | null;
};

export type AcceptancePreparationRecord = {
  id: string;
  tenant_id: string;
  service_order_id: string;
  work_order_id: string;
  status: string;
  summary: string;
  prepared_by_employee_id: string;
  prepared_at: string;
  submitted_at: string | null;
  acceptance_due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkOrderRecord = {
  id: string;
  tenant_id: string;
  service_order_id: string;
  order_no: string;
  status: string;
  assignee_employee_id: string | null;
  created_by_employee_id: string | null;
  assigned_at?: string | null;
  version?: number;
  created_at: string;
  updated_at: string;
  order?: {
    id: string;
    order_no: string;
    product_code: string;
    term_years: number;
    amount_fen: number;
    payment_status: string;
    service_status: string;
    paid_at: string | null;
    tenant?: {
      id: string;
      name: string | null;
      status?: string | null;
    } | Array<{
      id: string;
      name: string | null;
      status?: string | null;
    }> | null;
  } | null;
  acceptance_preparation?: AcceptancePreparationRecord | AcceptancePreparationRecord[] | null;
};

export type TenantServiceAcceptanceViewRecord = OrderRecord & {
  work_orders?: WorkOrderRecord[] | WorkOrderRecord | null;
  acceptance_preparations?:
    | AcceptancePreparationRecord[]
    | AcceptancePreparationRecord
    | null;
  fulfillment_records?: FulfillmentRecordRecord[] | null;
};

export type WorkOrderActionInput = {
  workOrderId: string;
  expectedVersion: number;
  operatorEmployeeId: string;
  remark?: string;
  metadata?: Record<string, unknown>;
};

export type AssignWorkOrderInput = WorkOrderActionInput & {
  assigneeEmployeeId: string;
};

export type TransitionWorkOrderInput = WorkOrderActionInput & {
  toStatus: string;
};

export type FulfillmentRecordCreateInput = {
  tenantId: string;
  serviceOrderId: string;
  workOrderId: string;
  recordType: string;
  title: string;
  content: string;
  occurredAt: string;
  fileIds: string[];
  createdByEmployeeId: string;
};

export type AcceptancePreparationInput = {
  tenantId: string;
  serviceOrderId: string;
  workOrderId: string;
  status: "draft" | "submitted";
  summary: string;
  fileIds: string[];
  preparedByEmployeeId: string;
  acceptanceDueAt?: string | null;
};

export type ServiceRefundReviewInput = {
  refundRequestId: string;
  decision: "approved" | "rejected";
  expectedVersion: number;
  operatorEmployeeId: string;
  reviewRemark?: string;
};

export type AtomicActionResult = {
  workOrder?: WorkOrderRecord | null;
  refundRequest?: RefundRequestRecord | null;
  acceptancePreparation?: AcceptancePreparationRecord | null;
  order: OrderRecord | null;
  contract?: ServiceContractRecord | null;
  contractPeriod?: ServiceContractPeriodRecord | null;
  idempotent?: boolean;
  errorCode?: string;
};

export type AcceptanceDecisionInput = {
  tenantId: string;
  serviceOrderId: string;
  decision: "accepted" | "rejected";
  expectedWorkOrderVersion: number;
  operatorEmployeeId: string;
  remark?: string;
};

export const REFUND_REQUEST_SELECT = [
  "id",
  "tenant_id",
  "service_order_id",
  "idempotency_key",
  "reason",
  "status",
  "version",
  "created_by_employee_id",
  "reviewed_by_employee_id",
  "reviewed_at",
  "review_remark",
  "out_refund_no",
  "wechat_refund_id",
  "refund_amount_fen",
  "refunded_at",
  "refunded_by_employee_id",
  "created_at",
  "updated_at",
].join(",");

export const PLATFORM_SERVICE_ORDER_SELECT = [
  "id",
  "tenant_id",
  "order_no",
  "out_trade_no",
  "product_code",
  "term_years",
  "amount_fen",
  "paid_amount_fen",
  "payment_status",
  "service_status",
  "transaction_id",
  "source_trial_id",
  "payment_expires_at",
  "paid_at",
  "closed_at",
  "terms_version",
  "version",
  "created_at",
  "updated_at",
  "tenant:tenants(id,name,status,contact_name,contact_phone)",
].join(",");

export const PLATFORM_SERVICE_ORDER_DETAIL_SELECT = [
  PLATFORM_SERVICE_ORDER_SELECT,
  "product_snapshot",
  "payment_config_id",
  "payment_config_guard_version",
].join(",");

export const PLATFORM_SERVICE_WORK_ORDER_SELECT = [
  "id",
  "tenant_id",
  "service_order_id",
  "order_no",
  "status",
  "assignee_employee_id",
  "created_by_employee_id",
  "assigned_at",
  "version",
  "created_at",
  "updated_at",
  "order:tenant_service_orders(id,order_no,product_code,term_years,amount_fen,payment_status,service_status,paid_at,tenant:tenants(id,name,status))",
  "acceptance_preparation:tenant_service_acceptance_preparations(id,tenant_id,service_order_id,work_order_id,status,summary,prepared_by_employee_id,prepared_at,submitted_at,acceptance_due_at,created_at,updated_at)",
].join(",");

export const PLATFORM_SERVICE_REFUND_REQUEST_SELECT = [
  REFUND_REQUEST_SELECT,
  "order:tenant_service_orders(id,order_no,product_code,term_years,amount_fen,payment_status,service_status,paid_at,tenant:tenants(id,name,status))",
].join(",");

export const TENANT_PRODUCT_SELECT = [
  "id",
  "code",
  "status",
  "published_version_id",
  "published_version:platform_service_product_versions!platform_service_products_published_version_fkey(id,version,title,term_years,list_amount_fen,amount_fen,service_scope,terms_version,terms_content)",
].join(",");

export const PLATFORM_PRODUCT_SELECT = [
  "id",
  "code",
  "title",
  "term_years",
  "list_amount_fen",
  "amount_fen",
  "service_scope",
  "terms_version",
  "terms_content",
  "status",
  "version",
  "published_version_id",
  "sort_order",
  "created_at",
  "updated_at",
  "published_version:platform_service_product_versions!platform_service_products_published_version_fkey(id,version,title,term_years,list_amount_fen,amount_fen,service_scope,terms_version,terms_content)",
].join(",");

export const TENANT_PUBLIC_ORDER_SELECT = [
  "id",
  "order_no",
  "product_code",
  "term_years",
  "amount_fen",
  "payment_status",
  "service_status",
  "payment_expires_at",
  "paid_at",
  "closed_at",
  "cancel_claim_expires_at",
  "terms_version",
  "version",
  "created_at",
  "updated_at",
].join(",");

export const TENANT_ACCEPTANCE_ORDER_SELECT = [
  TENANT_PUBLIC_ORDER_SELECT,
  "work_orders:tenant_service_work_orders(id,tenant_id,service_order_id,order_no,status,assignee_employee_id,created_by_employee_id,assigned_at,version,created_at,updated_at)",
  "acceptance_preparations:tenant_service_acceptance_preparations(id,tenant_id,service_order_id,work_order_id,status,summary,prepared_by_employee_id,prepared_at,submitted_at,acceptance_due_at,created_at,updated_at)",
  "fulfillment_records:tenant_service_fulfillment_records(id,tenant_id,service_order_id,work_order_id,record_type,title,content,occurred_at,created_by_employee_id,created_at,updated_at,attachments:tenant_service_fulfillment_attachments(id,file_id,file_name,mime_type,size_bytes,created_at,file:platform_file_objects!tenant_service_fulfillment_attachments_file_id_fkey(id,original_name,mime_type,size_bytes)))",
].join(",");

export const TENANT_INTERNAL_ORDER_SELECT = [
  "id",
  "tenant_id",
  "order_no",
  "out_trade_no",
  "product_id",
  "product_version_id",
  "product_code",
  "term_years",
  "amount_fen",
  "payment_status",
  "service_status",
  "payment_config_id",
  "payment_config_guard_version",
  "payer_openid",
  "product_snapshot",
  "transaction_id",
  "source_trial_id",
  "prepay_id",
  "payment_expires_at",
  "paid_at",
  "closed_at",
  "cancel_idempotency_key",
  "cancel_claim_expires_at",
  "terms_version",
  "version",
  "created_at",
  "updated_at",
].join(",");
import type {
  ServiceContractPeriodRecord,
  ServiceContractRecord,
} from "./platform-service-rpc-results";
