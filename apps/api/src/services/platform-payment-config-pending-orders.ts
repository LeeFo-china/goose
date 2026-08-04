import { Errors } from "@/errors/error-factory";
import { billingRechargeRepository } from "@/repositories/billing-recharge";
import {
  brandingAddonPaymentConfigRepository,
} from "@/repositories/branding-addon-payment-config";
import type {
  PlatformPaymentConfigRecord,
  PlatformPaymentConfigUpsertInput,
} from "@/repositories/platform-payment-configs";
import { platformServiceOrderRepository } from "@/repositories/platform-service-orders";

export type PendingPlatformPaymentOrdersPort = {
  hasPendingOrdersForPaymentConfig(paymentConfigId: string): Promise<boolean>;
};
export type PendingRechargeOrderPort = PendingPlatformPaymentOrdersPort;

const CRITICAL_CONFIG_FIELDS = [
  "merchant_mode",
  "merchant_id",
  "sub_merchant_id",
  "app_id",
  "sub_app_id",
  "serial_no",
  "encrypted_config_ref",
] as const;

const PENDING_CONFIG_ERROR = {
  statusCode: 409,
  message: "存在使用当前微信支付配置的待支付订单，请等待订单支付或关闭后再修改",
  code: "PLATFORM_PAYMENT_CONFIG_PENDING_ORDERS",
} as const;

export const pendingPlatformPaymentOrders: PendingPlatformPaymentOrdersPort = {
  async hasPendingOrdersForPaymentConfig(paymentConfigId: string) {
    const [hasRecharge, hasBrandingAddon, hasServiceOrder] = await Promise.all([
      billingRechargeRepository.hasPendingWechatOrdersForPaymentConfig(
        paymentConfigId,
      ),
      brandingAddonPaymentConfigRepository.hasPendingOrdersForPaymentConfig(
        paymentConfigId,
      ),
      platformServiceOrderRepository.hasPendingOrdersForPaymentConfig(
        paymentConfigId,
      ),
    ]);
    return hasRecharge || hasBrandingAddon || hasServiceOrder;
  },
};

function normalizeComparable(value: string | null) {
  return value?.trim() || null;
}

export async function assertCriticalPaymentConfigChangeAllowed(input: {
  current: PlatformPaymentConfigRecord | null;
  next: PlatformPaymentConfigUpsertInput;
  pendingRechargeOrders: PendingPlatformPaymentOrdersPort;
}) {
  if (!input.current) return;

  const hasCriticalChange = CRITICAL_CONFIG_FIELDS.some((field) =>
    normalizeComparable(input.current?.[field] ?? null) !==
      normalizeComparable(input.next[field])
  );
  if (!hasCriticalChange) return;

  const hasPendingOrders = await input.pendingRechargeOrders
    .hasPendingOrdersForPaymentConfig(input.current.id);
  if (!hasPendingOrders) return;

  throwPendingOrdersError();
}

export async function assertPaymentSecretChangeAllowed(input: {
  current: PlatformPaymentConfigRecord | null;
  pendingRechargeOrders: PendingPlatformPaymentOrdersPort;
}) {
  if (!input.current) return;

  const hasPendingOrders = await input.pendingRechargeOrders
    .hasPendingOrdersForPaymentConfig(input.current.id);
  if (!hasPendingOrders) return;

  throwPendingOrdersError();
}

function throwPendingOrdersError(): never {
  throw Errors.business(
    PENDING_CONFIG_ERROR.statusCode,
    PENDING_CONFIG_ERROR.message,
    PENDING_CONFIG_ERROR.code,
  );
}
