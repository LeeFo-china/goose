export const SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES = [
  'draft',
  'pending_approval',
  'approved',
  'partially_paid',
  'paid',
  'rejected',
  'cancelled',
  'closed',
] as const;

export const SUPPLIER_PAYMENT_REQUEST_STATUSES =
  SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES;

export type SupplierPaymentRequestStatus =
  (typeof SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES)[number];

export const ACTIVE_SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES = [
  'pending_approval',
  'approved',
  'partially_paid',
] as const satisfies readonly SupplierPaymentRequestStatus[];

export const ACTIVE_SUPPLIER_PAYMENT_REQUEST_STATUSES =
  ACTIVE_SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES;

export type ActiveSupplierPaymentRequestStatus =
  (typeof ACTIVE_SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES)[number];

export const SUPPLIER_PAYMENT_METHOD_VALUES = [
  'bank_transfer',
  'wechat',
  'alipay',
  'cash',
  'other',
] as const;

export const SUPPLIER_PAYMENT_METHODS = SUPPLIER_PAYMENT_METHOD_VALUES;

export type SupplierPaymentMethod =
  (typeof SUPPLIER_PAYMENT_METHOD_VALUES)[number];

export function canConfirmSupplierPayment(
  status: SupplierPaymentRequestStatus,
): boolean {
  return status === 'approved' || status === 'partially_paid';
}

export function canCloseSupplierPaymentRequest(
  status: SupplierPaymentRequestStatus,
): boolean {
  return status === 'partially_paid';
}
