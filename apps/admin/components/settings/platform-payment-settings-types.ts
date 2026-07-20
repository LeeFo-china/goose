export type PlatformPaymentProfileCode =
  | "platform_direct_recharge"
  | "tenant_service_provider";

export type PlatformPaymentMerchantMode =
  | "direct_merchant"
  | "service_provider_sub_merchant";

export type PlatformPaymentValidationStatus =
  | "unchecked"
  | "valid"
  | "invalid";

export type PlatformWechatPayConfigView = {
  id: string;
  provider: "wechat_pay";
  profile_code: PlatformPaymentProfileCode;
  principal_type: "platform";
  merchant_mode: PlatformPaymentMerchantMode;
  merchant_name: string | null;
  merchant_id: string | null;
  sub_merchant_id: string | null;
  app_id: string | null;
  sub_app_id: string | null;
  serial_no_masked: string | null;
  notify_url: string | null;
  enabled_channels: string[];
  status: "pending" | "active" | "disabled" | "suspended";
  validation_status: PlatformPaymentValidationStatus;
  last_validated_at: string | null;
  last_validation_error_code: string | null;
  last_validation_error_message: string | null;
  last_validation_request_id: string | null;
  has_encrypted_config_ref: boolean;
  has_secret_bundle_revision: boolean;
  created_at: string;
  updated_at: string;
};

export type PlatformWechatPayProfileView = {
  profile_code: PlatformPaymentProfileCode;
  label: string;
  description: string;
  secret_setting_key: string;
  configured: boolean;
  config: PlatformWechatPayConfigView | null;
};

export type PlatformWechatPayProfileListResult = {
  can_manage: boolean;
  profiles: PlatformWechatPayProfileView[];
  error?: string | null;
};

export type PlatformWechatPayReadinessChecks = {
  configured: boolean;
  active: boolean;
  validated: boolean;
  merchant_mode_matches: boolean;
  has_merchant_id: boolean;
  has_app_id: boolean;
  has_secret_ref: boolean;
  has_secret_bundle_revision: boolean;
  has_serial_no: boolean;
  has_callback: boolean;
  callback_is_https: boolean;
  required_channels_enabled: boolean;
};

export type PlatformWechatPayReadinessProfile = {
  profile_code: PlatformPaymentProfileCode;
  label: string;
  ready: boolean;
  blockers: Array<{ code: string; message: string }>;
  validation_status: PlatformPaymentValidationStatus | null;
  last_validated_at: string | null;
  checks: PlatformWechatPayReadinessChecks;
};

export type PlatformWechatPayReadinessResult = {
  ready: boolean;
  profiles: PlatformWechatPayReadinessProfile[];
};

export type PlatformWechatPayValidationSuccess = {
  ok: true;
  probe_mode: "platform_certificate" | "wechat_pay_public_key";
  api_v3_key_probe: "decrypted" | "format_only";
  request_id: string | null;
  validated_at: string;
};

export type PlatformWechatPayValidationFailure = {
  ok: false;
  error_code: string;
  message: string;
  request_id: string | null;
  validated_at: string;
};

export type PlatformWechatPayProfileValidationResult = {
  profile: PlatformWechatPayProfileView;
  validation:
    | PlatformWechatPayValidationSuccess
    | PlatformWechatPayValidationFailure;
};
