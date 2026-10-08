import { z } from 'zod';

export const PLATFORM_SERVICE_TRIAL_STATUS_VALUES = [
  'pending_review',
  'scheduled',
  'active',
  'grace_period',
  'expired',
  'rejected',
  'withdrawn',
  'revoked',
  'converted',
] as const;

export const PLATFORM_SERVICE_TRIAL_SOURCE_VALUES = [
  'tenant_application',
  'platform_grant',
] as const;

export const PLATFORM_SERVICE_TRIAL_TYPE_VALUES = [
  'standard',
  'guided',
] as const;

export const PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES = [
  'core.projects',
  'core.customers',
  'core.employees',
  'core.workflows',
  'core.files',
  'core.notifications',
  'business.marketing',
  'business.finance',
  'business.procurement',
  'business.inventory',
  'business.content',
  'business.ai',
  'business.settings',
] as const;

export const SERVICE_TRIAL_FOLLOW_UP_TYPE_VALUES = [
  'phone',
  'wechat',
  'online_meeting',
  'onsite',
  'other',
] as const;

export const SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES = [
  'pending',
  'completed',
  'canceled',
] as const;

export const SERVICE_TRIAL_NOTIFICATION_EVENT_VALUES = [
  'application_submitted',
  'approved',
  'rejected',
  'extended',
  'revoked',
  'expires_in_7_days',
  'expires_in_3_days',
  'expires_in_1_day',
  'entered_grace',
  'expired',
  'converted',
] as const;

export type PlatformServiceTrialStatus =
  (typeof PLATFORM_SERVICE_TRIAL_STATUS_VALUES)[number];
export type PlatformServiceTrialSource =
  (typeof PLATFORM_SERVICE_TRIAL_SOURCE_VALUES)[number];
export type PlatformServiceTrialType =
  (typeof PLATFORM_SERVICE_TRIAL_TYPE_VALUES)[number];
export type PlatformServiceTrialCapability =
  (typeof PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES)[number];
export type ServiceTrialFollowUpType =
  (typeof SERVICE_TRIAL_FOLLOW_UP_TYPE_VALUES)[number];
export type ServiceTrialFollowUpStatus =
  (typeof SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES)[number];
export type ServiceTrialNotificationEvent =
  (typeof SERVICE_TRIAL_NOTIFICATION_EVENT_VALUES)[number];

export type PlatformServiceTrialScopeV1 = {
  version: 1;
  capabilities: PlatformServiceTrialCapability[];
};

export const PlatformServiceTrialScopeSchema = z
  .object({
    version: z.literal(1),
    capabilities: z
      .array(z.enum(PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES))
      .min(1, '试用范围不能为空')
      .refine(
        (capabilities) => new Set(capabilities).size === capabilities.length,
        '试用范围不能包含重复能力',
      ),
  })
  .strict();

/** Explicit module snapshot; newly introduced capabilities require a new grant. */
export const PLATFORM_SERVICE_TRIAL_FULL_SCOPE: PlatformServiceTrialScopeV1 = {
  version: 1,
  capabilities: [...PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES],
};

export const PLATFORM_SERVICE_TRIAL_CAPABILITY_LABELS: Record<PlatformServiceTrialCapability, string> = {
  'core.projects': '项目与工地管理',
  'core.customers': '客户与线索管理',
  'core.employees': '员工与组织管理',
  'core.workflows': '流程管理',
  'core.files': '文件与效果图库',
  'core.notifications': '通知中心',
  'business.marketing': '营销活动与H5获客',
  'business.finance': '财务与费用管理',
  'business.procurement': '供应商与采购管理',
  'business.inventory': '仓库与库存管理',
  'business.content': '自媒体与内容运营',
  'business.ai': 'AI与文字识别',
  'business.settings': '企业设置与用量查看',
};
