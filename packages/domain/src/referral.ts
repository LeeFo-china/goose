export const EXTERNAL_REFERRER_STATUS_VALUES = [
  'active',
  'inactive',
] as const;

export type ExternalReferrerStatus =
  (typeof EXTERNAL_REFERRER_STATUS_VALUES)[number];

export const PROJECT_REFERRAL_STATUS_VALUES = [
  'pending',
  'calculated',
  'paid',
  'cancelled',
] as const;

export type ProjectReferralStatus =
  (typeof PROJECT_REFERRAL_STATUS_VALUES)[number];

export interface ReferralStatusConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const ExternalReferrerStatusConfig: Record<
  ExternalReferrerStatus,
  ReferralStatusConfigItem
> = {
  active: { label: '启用', type: 'success' },
  inactive: { label: '停用', type: 'default' },
};

export const ProjectReferralStatusConfig: Record<
  ProjectReferralStatus,
  ReferralStatusConfigItem
> = {
  pending: { label: '待计算', type: 'warning' },
  calculated: { label: '已计算', type: 'primary' },
  paid: { label: '已支付', type: 'success' },
  cancelled: { label: '已作废', type: 'danger' },
};

export const PROJECT_REFERRAL_RATE_BPS_MIN = 100;
export const PROJECT_REFERRAL_RATE_BPS_MAX = 400;

export const isExternalReferrerStatus = (
  value: string | null | undefined,
): value is ExternalReferrerStatus =>
  typeof value === 'string' &&
  EXTERNAL_REFERRER_STATUS_VALUES.includes(value as ExternalReferrerStatus);

export const isProjectReferralStatus = (
  value: string | null | undefined,
): value is ProjectReferralStatus =>
  typeof value === 'string' &&
  PROJECT_REFERRAL_STATUS_VALUES.includes(value as ProjectReferralStatus);
