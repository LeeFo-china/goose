export const AUTH_TARGET_ROLE_VALUES = ['customer', 'employee'] as const;

export type AuthTargetRole = (typeof AUTH_TARGET_ROLE_VALUES)[number];

export const SMS_SCENE_VALUES = [
  'bind_customer',
  'bind_employee',
  'login_identity',
  'admin_login',
  'rebind_wechat',
  'bind_platform_partner',
  'unbind_platform_partner',
  'rebind_platform_partner',
  'partner_application',
  'partner_tenant_onboarding',
  'tenant_onboarding_application',
  'douyin_lead',
] as const;

export type SmsScene = (typeof SMS_SCENE_VALUES)[number];

export const SMS_VERIFICATION_STATUS_VALUES = [
  'pending',
  'verified',
  'expired',
] as const;

export type SmsVerificationStatus =
  (typeof SMS_VERIFICATION_STATUS_VALUES)[number];
