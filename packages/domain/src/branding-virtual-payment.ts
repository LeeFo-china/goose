import { VIRTUAL_PAYMENT_ENVIRONMENTS } from './virtual-product';

export { VIRTUAL_PAYMENT_ENVIRONMENTS };

export const BRANDING_PURCHASE_MODES = [
  'direct_legacy',
  'maintenance',
  'wechat_virtual',
] as const;

export const VIRTUAL_PAYMENT_PLATFORMS = [
  'android',
  'harmony',
  'windows',
  'ios',
  'unknown',
] as const;

export const VIRTUAL_PAYMENT_STATUSES = [
  'pending',
  'succeeded',
  'closed',
  'failed',
] as const;

export const VIRTUAL_FULFILLMENT_STATUSES = [
  'pending',
  'granted',
  'grant_failed',
] as const;

export const VIRTUAL_REFUND_STATUSES = [
  'none',
  'reviewing',
  'submitted',
  'external_required',
  'succeeded',
  'failed',
  'rejected',
] as const;

export const BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN = 100;

export type BrandingPurchaseMode = (typeof BRANDING_PURCHASE_MODES)[number];

export type BrandingVirtualPaymentEnvironment =
  (typeof VIRTUAL_PAYMENT_ENVIRONMENTS)[number];

export type BrandingVirtualPaymentPlatform =
  (typeof VIRTUAL_PAYMENT_PLATFORMS)[number];

export type BrandingVirtualPaymentStatus =
  (typeof VIRTUAL_PAYMENT_STATUSES)[number];

export type BrandingVirtualFulfillmentStatus =
  (typeof VIRTUAL_FULFILLMENT_STATUSES)[number];

export type BrandingVirtualRefundStatus =
  (typeof VIRTUAL_REFUND_STATUSES)[number];

export type BrandingVirtualPaymentRequest = {
  kind: 'wechat_virtual';
  environment: BrandingVirtualPaymentEnvironment;
  request_payload: {
    signData: string;
    mode: 'short_series_goods';
    paySig: string;
    signature: string;
  };
};
