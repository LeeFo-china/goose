import { describe, expect, test } from 'bun:test';

import {
  BRANDING_PURCHASE_MODES,
  BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN,
  VIRTUAL_FULFILLMENT_STATUSES,
  VIRTUAL_PAYMENT_ENVIRONMENTS,
  VIRTUAL_PAYMENT_PLATFORMS,
  VIRTUAL_PAYMENT_STATUSES,
  VIRTUAL_REFUND_STATUSES,
  type BrandingPurchaseMode,
  type BrandingVirtualFulfillmentStatus,
  type BrandingVirtualPaymentEnvironment,
  type BrandingVirtualPaymentPlatform,
  type BrandingVirtualPaymentRequest,
  type BrandingVirtualPaymentStatus,
  type BrandingVirtualRefundStatus,
} from './branding-virtual-payment';

describe('branding virtual payment domain', () => {
  test('keeps every shared virtual-payment state value stable', () => {
    expect(BRANDING_PURCHASE_MODES).toEqual([
      'direct_legacy',
      'maintenance',
      'wechat_virtual',
    ]);
    expect(VIRTUAL_PAYMENT_ENVIRONMENTS).toEqual(['sandbox', 'production']);
    expect(VIRTUAL_PAYMENT_PLATFORMS).toEqual([
      'android',
      'harmony',
      'windows',
      'ios',
      'unknown',
    ]);
    expect(VIRTUAL_PAYMENT_STATUSES).toEqual([
      'pending',
      'succeeded',
      'closed',
      'failed',
    ]);
    expect(VIRTUAL_FULFILLMENT_STATUSES).toEqual([
      'pending',
      'granted',
      'grant_failed',
    ]);
    expect(VIRTUAL_REFUND_STATUSES).toEqual([
      'none',
      'reviewing',
      'submitted',
      'external_required',
      'succeeded',
      'failed',
      'rejected',
    ]);
    expect(BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN).toBe(100);
  });

  test('keeps the mini-program virtual-payment request shape stable', () => {
    const request = {
      kind: 'wechat_virtual',
      environment: 'production',
      request_payload: {
        signData: 'signed-order-data',
        mode: 'short_series_goods',
        paySig: 'payment-signature',
        signature: 'user-signature',
      },
    } satisfies BrandingVirtualPaymentRequest;

    expect(request).toEqual({
      kind: 'wechat_virtual',
      environment: 'production',
      request_payload: {
        signData: 'signed-order-data',
        mode: 'short_series_goods',
        paySig: 'payment-signature',
        signature: 'user-signature',
      },
    });
  });

  test('exposes a union type for each controlled value catalog', () => {
    const values = {
      purchaseMode: 'wechat_virtual' as BrandingPurchaseMode,
      environment: 'sandbox' as BrandingVirtualPaymentEnvironment,
      platform: 'harmony' as BrandingVirtualPaymentPlatform,
      paymentStatus: 'succeeded' as BrandingVirtualPaymentStatus,
      fulfillmentStatus: 'grant_failed' as BrandingVirtualFulfillmentStatus,
      refundStatus: 'external_required' as BrandingVirtualRefundStatus,
    };

    expect(values).toEqual({
      purchaseMode: 'wechat_virtual',
      environment: 'sandbox',
      platform: 'harmony',
      paymentStatus: 'succeeded',
      fulfillmentStatus: 'grant_failed',
      refundStatus: 'external_required',
    });
  });
});
