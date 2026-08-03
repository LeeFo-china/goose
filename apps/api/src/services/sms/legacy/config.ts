import {
  Errors,
  TENCENT_SMS_DEFAULT_ENDPOINT,
  systemSettingsService,
  type SmsChannel,
  type SmsProvider,
  type SmsTemplatePurpose,
} from "./shared";

export function normalizeProvider(value: string): SmsProvider {
  const provider = value.trim().toLowerCase();
  if (
    provider === "mock" ||
    provider === "disabled" ||
    provider === "aliyun" ||
    provider === "tencent"
  ) {
    return provider;
  }

  return "mock";
}

export function normalizeEndpoint(value: string) {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") ||
    TENCENT_SMS_DEFAULT_ENDPOINT;
}

export function getTemplateConfigKey(input: {
  provider: "aliyun" | "tencent";
  purpose: SmsTemplatePurpose;
}) {
  const prefix = input.provider === "aliyun"
    ? "ALIYUN_SMS_TEMPLATE_CODE"
    : "TENCENT_SMS_TEMPLATE_ID";

  const tenantOnboardingSuffixes = {
    tenant_onboarding_submitted: "TENANT_ONBOARDING_SUBMITTED",
    tenant_onboarding_supplement_required:
      "TENANT_ONBOARDING_SUPPLEMENT_REQUIRED",
    tenant_onboarding_approved: "TENANT_ONBOARDING_APPROVED",
    tenant_onboarding_rejected: "TENANT_ONBOARDING_REJECTED",
  } as const;
  if (input.purpose in tenantOnboardingSuffixes) {
    const purpose = input.purpose as keyof typeof tenantOnboardingSuffixes;
    return `${prefix}_${tenantOnboardingSuffixes[purpose]}`;
  }

  if (input.purpose === "bind_customer" || input.purpose === "douyin_lead") {
    return `${prefix}_BIND_CUSTOMER`;
  }

  if (input.purpose === "unbind_platform_partner") {
    return `${prefix}_BIND_CUSTOMER`;
  }

  if (input.purpose === "rebind_platform_partner") {
    return `${prefix}_BIND_CUSTOMER`;
  }

  if (input.purpose === "rebind_wechat") {
    return `${prefix}_BIND_CUSTOMER`;
  }

  if (input.purpose === "partner_application") {
    return `${prefix}_BIND_CUSTOMER`;
  }

  if (input.purpose === "partner_tenant_onboarding") {
    return `${prefix}_BIND_CUSTOMER`;
  }

  if (input.purpose === "admin_login") {
    return `${prefix}_ADMIN_LOGIN`;
  }

  if (input.purpose === "project_acceptance") {
    return `${prefix}_PROJECT_ACCEPTANCE`;
  }

  return `${prefix}_BIND_EMPLOYEE`;
}

export async function getSmsChannel(tenantId?: string | null): Promise<SmsChannel> {
  if (tenantId) {
    const mode = (await systemSettingsService.getTenantOverrideString(
      "SMS_CHANNEL_MODE",
      tenantId,
      "platform",
    )).trim();

    if (mode === "tenant_aliyun") {
      return {
        provider: "aliyun",
        tenantId,
        strictTenantConfig: true,
        channelMode: "tenant_aliyun",
      };
    }

    if (mode === "tenant_tencent") {
      return {
        provider: "tencent",
        tenantId,
        strictTenantConfig: true,
        channelMode: "tenant_tencent",
      };
    }
  }

  const provider = normalizeProvider(
    await systemSettingsService.getString("SMS_PROVIDER", "mock"),
  );
  return {
    provider,
    tenantId: tenantId || null,
    strictTenantConfig: false,
    channelMode: "platform",
  };
}

export async function readSmsConfig(
  channel: SmsChannel,
  key: string,
  fallbackValue = "",
) {
  if (channel.strictTenantConfig) {
    return systemSettingsService.getTenantOverrideString(
      key,
      channel.tenantId,
      fallbackValue,
    );
  }

  return systemSettingsService.getSecretString(key, fallbackValue);
}

export async function requireSmsConfig(channel: SmsChannel, key: string) {
  const value = await readSmsConfig(channel, key);

  if (!value) {
    throw Errors.business(
      503,
      channel.strictTenantConfig
        ? `租户短信配置不完整: ${key}`
        : `缺少短信配置: ${key}`,
      "SMS_CONFIG_MISSING",
    );
  }

  return value;
}

export async function getAliyunTemplateCode(
  channel: SmsChannel,
  purpose: SmsTemplatePurpose,
) {
  const key = getTemplateConfigKey({ provider: "aliyun", purpose });
  const value = await readSmsConfig(channel, key);
  if (value) return value;

  if (purpose === "admin_login") {
    return requireSmsConfig(
      channel,
      getTemplateConfigKey({ provider: "aliyun", purpose: "bind_employee" }),
    );
  }

  return requireSmsConfig(channel, key);
}

export async function getTencentTemplateId(
  channel: SmsChannel,
  purpose: SmsTemplatePurpose,
) {
  const key = getTemplateConfigKey({ provider: "tencent", purpose });
  const value = await readSmsConfig(channel, key);
  if (value) return value;

  if (purpose === "admin_login") {
    return requireSmsConfig(
      channel,
      getTemplateConfigKey({ provider: "tencent", purpose: "bind_employee" }),
    );
  }

  return requireSmsConfig(channel, key);
}
