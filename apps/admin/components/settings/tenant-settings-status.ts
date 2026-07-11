import type { SystemSetting } from "@/components/settings/settings-types";

export const tenantSmsModeLabels: Record<string, string> = {
  platform: "继承平台短信通道",
  tenant_aliyun: "自有阿里云短信通道",
  tenant_tencent: "自有腾讯云短信通道",
};

const aliyunSmsKeys = new Set([
  "ALIBABA_CLOUD_ACCESS_KEY_ID",
  "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
  "ALIYUN_SMS_SIGN_NAME",
  "ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER",
  "ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE",
  "ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN",
  "ALIYUN_SMS_TEMPLATE_CODE_PROJECT_ACCEPTANCE",
  "PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS",
]);

const tencentSmsKeys = new Set([
  "TENCENT_SMS_SECRET_ID",
  "TENCENT_SMS_SECRET_KEY",
  "TENCENT_SMS_REGION",
  "TENCENT_SMS_ENDPOINT",
  "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER",
  "TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE",
  "TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN",
  "TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE",
  "PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS",
]);

export function getTenantSmsProviderSettings(
  settings: SystemSetting[],
  mode: string,
) {
  return settings.filter((setting) => {
    if (setting.key === "SMS_CHANNEL_MODE") return false;
    if (mode === "tenant_aliyun") return aliyunSmsKeys.has(setting.key);
    if (mode === "tenant_tencent") return tencentSmsKeys.has(setting.key);
    return false;
  });
}

export function countTenantGroupMissing(
  groupCode: string,
  settings: SystemSetting[],
) {
  if (groupCode !== "sms") {
    return settings.filter((setting) => setting.source === "empty").length;
  }

  const modeSetting = settings.find(
    (setting) => setting.key === "SMS_CHANNEL_MODE",
  );
  if (!modeSetting || modeSetting.source === "empty") {
    return 1;
  }

  const mode = modeSetting.effective_value || "platform";
  return getTenantSmsProviderSettings(settings, mode).filter(
    (setting) => setting.source === "empty",
  ).length;
}
