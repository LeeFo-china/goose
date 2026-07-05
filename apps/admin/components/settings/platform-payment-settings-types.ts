export type PlatformPaymentProfileCode =
  | "platform_direct_recharge"
  | "tenant_service_provider";

export type PlatformPaymentMerchantMode =
  | "direct_merchant"
  | "service_provider_sub_merchant";

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
  encrypted_config_ref: string | null;
  serial_no_masked: string | null;
  notify_url: string | null;
  enabled_channels: string[];
  status: "pending" | "active" | "disabled" | "suspended";
  validation_status: "unchecked" | "valid" | "invalid";
  last_validated_at: string | null;
  has_encrypted_config_ref: boolean;
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
