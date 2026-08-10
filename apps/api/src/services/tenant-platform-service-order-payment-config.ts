import { Errors } from "@/errors/error-factory";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { OrderRecord } from "@/repositories/platform-service-order-records";

const SERVICE_PAYMENT_CHANNEL = "platform_service";

export function requireActiveServicePaymentConfig(
  config: PlatformPaymentConfigRecord | null,
) {
  if (!config || config.status !== "active") {
    throwPaymentConfigInvalid();
  }
  assertServicePaymentConfig(config);
  return { config, guardVersion: requireGuardVersion(config) };
}

export function requireOrderPaymentConfig(
  config: PlatformPaymentConfigRecord | null,
  order: Pick<OrderRecord, "payment_config_id" | "payment_config_guard_version">,
) {
  if (
    !config ||
    config.id !== order.payment_config_id ||
    config.recharge_guard_version !== order.payment_config_guard_version
  ) {
    throwPaymentConfigInvalid();
  }
  assertServicePaymentConfig(config);
  return config;
}

function assertServicePaymentConfig(config: PlatformPaymentConfigRecord) {
  if (
    config.profile_code !== "platform_direct_recharge" ||
    config.merchant_mode !== "direct_merchant" ||
    config.validation_status !== "valid" ||
    !config.merchant_id ||
    !config.app_id ||
    !config.encrypted_config_ref ||
    !config.secret_bundle_revision?.trim() ||
    !config.serial_no ||
    !config.notify_url ||
    !config.enabled_channels.includes(SERVICE_PAYMENT_CHANNEL)
  ) {
    throwPaymentConfigInvalid();
  }
}

function requireGuardVersion(config: PlatformPaymentConfigRecord) {
  const version = config.recharge_guard_version;
  if (!Number.isSafeInteger(version) || Number(version) <= 0) {
    throwPaymentConfigInvalid();
  }
  return Number(version);
}

function throwPaymentConfigInvalid(): never {
  throw Errors.business(
    409,
    "平台服务微信支付配置不可用",
    "SERVICE_PAYMENT_CONFIG_INVALID",
  );
}
