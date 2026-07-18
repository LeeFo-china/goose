import { Errors } from "@/errors/error-factory";
import type { billingRechargeRepository } from "@/repositories/billing-recharge";
import type {
  PlatformPaymentConfigRecord,
  PlatformPaymentConfigUpsertInput,
} from "@/repositories/platform-payment-configs";

export type PendingRechargeOrderPort = Pick<
  typeof billingRechargeRepository,
  "hasPendingWechatOrdersForPaymentConfig"
>;

const CRITICAL_CONFIG_FIELDS = [
  "merchant_mode",
  "merchant_id",
  "sub_merchant_id",
  "app_id",
  "sub_app_id",
  "serial_no",
  "encrypted_config_ref",
] as const;

const PENDING_RECHARGE_CONFIG_ERROR = {
  statusCode: 409,
  message: "存在使用当前微信支付配置的待支付充值订单，请等待订单支付或关闭后再修改",
  code: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
} as const;

function normalizeComparable(value: string | null) {
  return value?.trim() || null;
}

export async function assertCriticalPaymentConfigChangeAllowed(input: {
  current: PlatformPaymentConfigRecord | null;
  next: PlatformPaymentConfigUpsertInput;
  pendingRechargeOrders: PendingRechargeOrderPort;
}) {
  if (!input.current) return;

  const hasCriticalChange = CRITICAL_CONFIG_FIELDS.some((field) =>
    normalizeComparable(input.current?.[field] ?? null) !==
      normalizeComparable(input.next[field])
  );
  if (!hasCriticalChange) return;

  const hasPendingOrders = await input.pendingRechargeOrders
    .hasPendingWechatOrdersForPaymentConfig(input.current.id);
  if (!hasPendingOrders) return;

  throw Errors.business(
    PENDING_RECHARGE_CONFIG_ERROR.statusCode,
    PENDING_RECHARGE_CONFIG_ERROR.message,
    PENDING_RECHARGE_CONFIG_ERROR.code,
  );
}

export async function assertPaymentSecretChangeAllowed(input: {
  current: PlatformPaymentConfigRecord | null;
  pendingRechargeOrders: PendingRechargeOrderPort;
}) {
  if (!input.current) return;

  const hasPendingOrders = await input.pendingRechargeOrders
    .hasPendingWechatOrdersForPaymentConfig(input.current.id);
  if (!hasPendingOrders) return;

  throw Errors.business(
    PENDING_RECHARGE_CONFIG_ERROR.statusCode,
    PENDING_RECHARGE_CONFIG_ERROR.message,
    PENDING_RECHARGE_CONFIG_ERROR.code,
  );
}
