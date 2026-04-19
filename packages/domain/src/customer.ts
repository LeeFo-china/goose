export const CUSTOMER_STATUS_VALUES = [
  'potential',
  'following',
  'arrived',
  'ordered',
  'contracted',
  'dormant',
  'invalid',
] as const;

export type CustomerStatus = (typeof CUSTOMER_STATUS_VALUES)[number];

export const CUSTOMER_SOURCE_VALUES = [
  'douyin',
  'referral',
  'walk_in',
  'telemarketing',
  'platform',
] as const;

export type CustomerSource = (typeof CUSTOMER_SOURCE_VALUES)[number];

export interface CustomerStatusConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const CustomerStatusConfig: Record<
  CustomerStatus,
  CustomerStatusConfigItem
> = {
  potential: { label: '潜在客户', type: 'default' },
  following: { label: '跟进中', type: 'primary' },
  arrived: { label: '已到店', type: 'warning' },
  ordered: { label: '已下定', type: 'success' },
  contracted: { label: '已签约', type: 'success' },
  dormant: { label: '沉睡客户', type: 'default' },
  invalid: { label: '无效客户', type: 'danger' },
};

export const CustomerSourceConfig: Record<CustomerSource, { label: string }> = {
  douyin: { label: '抖音/短视频' },
  referral: { label: '老客介绍' },
  walk_in: { label: '自然进店' },
  telemarketing: { label: '电销开发' },
  platform: { label: '装修平台' },
};

export const isCustomerStatus = (
  value: string | null | undefined,
): value is CustomerStatus =>
  typeof value === 'string' &&
  CUSTOMER_STATUS_VALUES.includes(value as CustomerStatus);

export const isCustomerSource = (
  value: string | null | undefined,
): value is CustomerSource =>
  typeof value === 'string' &&
  CUSTOMER_SOURCE_VALUES.includes(value as CustomerSource);
