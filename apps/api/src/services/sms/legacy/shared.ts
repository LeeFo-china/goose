import type { SmsScene as DomainSmsScene } from "@gooes/domain";

export { smsSendLogRepository } from "@/repositories/sms-send-logs";
export { Errors } from "@/errors/error-factory";
export { billingService } from "@/services/billing";
export { systemSettingsService } from "@/services/system-settings";
export type SmsScene = DomainSmsScene;

export type SmsProvider = "mock" | "disabled" | "aliyun" | "tencent";
export type SmsTemplatePurpose = DomainSmsScene | "project_acceptance";
export type SmsChannel = {
  provider: SmsProvider;
  tenantId?: string | null;
  strictTenantConfig: boolean;
  channelMode: "platform" | "tenant_aliyun" | "tenant_tencent";
};
export type SmsProviderResult = {
  requestId?: string | null;
  providerCode?: string | null;
  providerMessage?: string | null;
};

export const TENCENT_SMS_API_VERSION = "2021-01-11";
export const TENCENT_SMS_SERVICE = "sms";
export const TENCENT_SMS_DEFAULT_ENDPOINT = "sms.tencentcloudapi.com";
export const TENCENT_SMS_DEFAULT_REGION = "ap-guangzhou";
