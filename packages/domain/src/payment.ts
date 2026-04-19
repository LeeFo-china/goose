export const PAYMENT_STATUS_VALUES = [
  'pending',
  'confirmed',
  'rejected',
  'refunded',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUS_VALUES)[number];

export interface PaymentStatusConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const PaymentStatusConfig: Record<
  PaymentStatus,
  PaymentStatusConfigItem
> = {
  pending: { label: '待审核', type: 'warning' },
  confirmed: { label: '已入账', type: 'success' },
  rejected: { label: '已拒绝', type: 'danger' },
  refunded: { label: '已退款', type: 'default' },
};

export const PAYMENT_TYPE_VALUES = [
  'deposit',
  'stage_1',
  'stage_2',
  'stage_3',
  'add_on',
  'refund',
] as const;

export type PaymentType = (typeof PAYMENT_TYPE_VALUES)[number];

export interface PaymentTypeConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const PaymentTypeConfig: Record<PaymentType, PaymentTypeConfigItem> = {
  deposit: { label: '意向定金', type: 'primary' },
  stage_1: { label: '开工首付款', type: 'warning' },
  stage_2: { label: '中期进度款', type: 'warning' },
  stage_3: { label: '工程尾款', type: 'warning' },
  add_on: { label: '后期增项款', type: 'danger' },
  refund: { label: '退款支出', type: 'default' },
};

export const isPaymentStatus = (
  value: string | null | undefined,
): value is PaymentStatus =>
  typeof value === 'string' &&
  PAYMENT_STATUS_VALUES.includes(value as PaymentStatus);

export const isPaymentType = (
  value: string | null | undefined,
): value is PaymentType =>
  typeof value === 'string' &&
  PAYMENT_TYPE_VALUES.includes(value as PaymentType);
