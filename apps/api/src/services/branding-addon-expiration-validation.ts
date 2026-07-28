import { Errors } from "@/errors/error-factory";
import type { BrandingAddonExpirationOrderRecord } from "@/repositories/branding-addon-order-records";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { WechatPayValidatedSuccessTransaction } from "@/services/wechat-pay-transaction-contract";

export function assertBoundBrandingAddonPaymentContext(
  order: BrandingAddonExpirationOrderRecord,
  config: PlatformPaymentConfigRecord,
) {
  const ready = config.id === order.payment_config_id &&
    config.provider === "wechat_pay" &&
    config.profile_code === "platform_direct_recharge" &&
    config.principal_type === "platform" &&
    config.merchant_mode === "direct_merchant" &&
    ["active", "disabled", "suspended"].includes(config.status) &&
    config.merchant_id === order.payment_mchid &&
    config.app_id === order.payment_appid &&
    config.recharge_guard_version === order.expected_guard_version &&
    Boolean(optionalString(config.serial_no)) &&
    Boolean(optionalString(config.encrypted_config_ref));
  if (!ready) throw paymentContextInvalid();
}

export function canCloseNonexistentBrandingAddonOrder(
  order: BrandingAddonExpirationOrderRecord,
  error: unknown,
) {
  if (optionalString(order.prepay_id)) return false;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; details?: unknown };
  if (candidate.code !== "WECHAT_PAY_TRANSACTION_QUERY_FAILED") return false;
  if (!candidate.details || typeof candidate.details !== "object") return false;
  const details = candidate.details as { status?: unknown; code?: unknown };
  return details.status === 404 && details.code === "ORDER_NOT_EXIST";
}

export function hasMatchingBrandingAddonAppid(
  transaction: WechatPayValidatedSuccessTransaction,
  expectedAppid: string,
): transaction is WechatPayValidatedSuccessTransaction & { appid: string } {
  return transaction.appid === expectedAppid;
}

export function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function paymentContextInvalid() {
  return Errors.business(
    409,
    "品牌权益订单支付配置不匹配",
    "BRANDING_ADDON_PAYMENT_CONTEXT_INVALID",
  );
}
