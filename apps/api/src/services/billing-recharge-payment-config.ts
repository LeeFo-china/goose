import { Errors } from "@/errors/error-factory";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";

const RECHARGE_CHANNEL = "tenant_recharge";
const VERSION_CHANGED = "BILLING_RECHARGE_PAYMENT_CONFIG_VERSION_CHANGED";

function assertPaymentMaterial(
  config: PlatformPaymentConfigRecord,
) {
  if (
    config.profile_code !== "platform_direct_recharge" ||
    config.merchant_mode !== "direct_merchant" ||
    !config.merchant_id ||
    !config.app_id ||
    !config.encrypted_config_ref ||
    !config.serial_no ||
    !config.notify_url
  ) {
    throw Errors.business(
      409,
      "平台微信支付配置不完整",
      "BILLING_RECHARGE_PAYMENT_CONFIG_MISSING",
    );
  }
}

function requireGuardVersion(config: PlatformPaymentConfigRecord) {
  const version = config.recharge_guard_version;
  if (!Number.isSafeInteger(version) || Number(version) <= 0) {
    throw Errors.business(
      409,
      "平台微信支付配置版本不可用",
      "BILLING_RECHARGE_PAYMENT_CONFIG_INVALID",
    );
  }
  return Number(version);
}

export function requireActiveRechargePaymentConfig(
  config: PlatformPaymentConfigRecord | null,
) {
  if (!config || config.status !== "active") {
    throw Errors.business(
      409,
      "平台微信支付配置未启用",
      "BILLING_RECHARGE_PAYMENT_CONFIG_INVALID",
    );
  }
  if (!config.enabled_channels.includes(RECHARGE_CHANNEL)) {
    throw Errors.business(
      409,
      "平台微信支付配置未启用积分充值",
      "BILLING_RECHARGE_PAYMENT_CONFIG_INVALID",
    );
  }
  assertPaymentMaterial(config);
  return { config, guardVersion: requireGuardVersion(config) };
}

export function requirePostInsertRechargePaymentConfig(input: {
  config: PlatformPaymentConfigRecord | null;
  expectedConfigId: string;
  expectedGuardVersion: number;
}) {
  if (
    !input.config ||
    input.config.id !== input.expectedConfigId ||
    input.config.recharge_guard_version !== input.expectedGuardVersion
  ) {
    throw Errors.business(
      409,
      "微信支付配置已更新，请重新发起充值",
      VERSION_CHANGED,
    );
  }
  assertPaymentMaterial(input.config);
  return input.config;
}
