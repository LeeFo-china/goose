export const VIRTUAL_BENEFIT_TYPES = [
  'duration',
  'count',
  'points',
  'quota',
] as const;

export const VIRTUAL_PRODUCT_STATUSES = [
  'draft',
  'active',
  'suspended',
  'archived',
] as const;

export const VIRTUAL_REFUND_TEMPLATES = [
  'duration_before_fulfillment',
  'consumable_unused_full_reverse',
] as const;

export const VIRTUAL_EXPIRY_MODES = ['permanent', 'fixed_duration'] as const;

export const VIRTUAL_DURATION_UNITS = ['month', 'year'] as const;

export const VIRTUAL_PAYMENT_ENVIRONMENTS = [
  'sandbox',
  'production',
] as const;

export const VIRTUAL_CHANNEL_VALIDATION_STATUSES = [
  'pending',
  'valid',
  'invalid',
] as const;

export const VIRTUAL_GOODS_OPERATION_PHASES = ['upload', 'publish'] as const;

export const VIRTUAL_GOODS_OPERATION_STATES = [
  'submitted',
  'processing',
  'succeeded',
  'failed',
  'unknown',
] as const;

export type VirtualBenefitType = (typeof VIRTUAL_BENEFIT_TYPES)[number];

export type VirtualProductStatus = (typeof VIRTUAL_PRODUCT_STATUSES)[number];

export type VirtualPaymentEnvironment =
  (typeof VIRTUAL_PAYMENT_ENVIRONMENTS)[number];

export type VirtualGoodsOperationState =
  (typeof VIRTUAL_GOODS_OPERATION_STATES)[number];

export type VirtualProductListQuery = {
  page: number;
  pageSize: number;
  keyword?: string;
  productType?: VirtualBenefitType;
  status?: VirtualProductStatus;
  productionValidationStatus?: 'pending' | 'valid' | 'invalid' | 'out_of_sync';
};
