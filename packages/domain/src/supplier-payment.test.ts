import { describe, expect, test } from 'bun:test';

import {
  ACTIVE_SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES,
  ACTIVE_SUPPLIER_PAYMENT_REQUEST_STATUSES,
  SUPPLIER_PAYMENT_METHODS,
  SUPPLIER_PAYMENT_METHOD_VALUES,
  SUPPLIER_PAYMENT_REQUEST_STATUSES,
  SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES,
  canCloseSupplierPaymentRequest,
  canConfirmSupplierPayment,
} from './supplier-payment';

describe('supplier payment domain', () => {
  test('keeps stable request lifecycle values', () => {
    expect(SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES).toEqual([
      'draft',
      'pending_approval',
      'approved',
      'partially_paid',
      'paid',
      'rejected',
      'cancelled',
      'closed',
    ]);
    expect(ACTIVE_SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES).toEqual([
      'pending_approval',
      'approved',
      'partially_paid',
    ]);
    expect(SUPPLIER_PAYMENT_REQUEST_STATUSES)
      .toBe(SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES);
    expect(ACTIVE_SUPPLIER_PAYMENT_REQUEST_STATUSES)
      .toBe(ACTIVE_SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES);
  });

  test('keeps stable payment methods', () => {
    expect(SUPPLIER_PAYMENT_METHOD_VALUES).toEqual([
      'bank_transfer',
      'wechat',
      'alipay',
      'cash',
      'other',
    ]);
    expect(SUPPLIER_PAYMENT_METHODS).toBe(SUPPLIER_PAYMENT_METHOD_VALUES);
  });

  test('confirms payments only for approved or partially paid requests', () => {
    for (const status of SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES) {
      expect(canConfirmSupplierPayment(status)).toBe(
        status === 'approved' || status === 'partially_paid',
      );
    }
  });

  test('closes only partially paid requests', () => {
    for (const status of SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES) {
      expect(canCloseSupplierPaymentRequest(status)).toBe(
        status === 'partially_paid',
      );
    }
  });
});
