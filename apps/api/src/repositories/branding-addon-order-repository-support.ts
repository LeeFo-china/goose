import { Errors } from "@/errors/error-factory";
import type {
  BrandingAddonNotificationCreateInput,
  BrandingAddonWechatNotificationRecord,
} from "@/repositories/branding-addon-order-records";
import { isPostgresUniqueViolation } from "@/repositories/repository-errors";

const CONFIRMATION_ERRORS = {
  BRANDING_ADDON_CONFIRM_INPUT_INVALID: [400, "支付确认参数不合法"],
  BRANDING_ADDON_ORDER_NOT_FOUND: [404, "年度品牌权益订单不存在"],
  BRANDING_ADDON_OUT_TRADE_NO_MISMATCH: [409, "商户订单号不匹配"],
  BRANDING_ADDON_CALLBACK_AMOUNT_MISMATCH: [409, "支付金额不匹配"],
  BRANDING_ADDON_CALLBACK_CONTEXT_MISMATCH: [409, "支付商户上下文不匹配"],
  BRANDING_ADDON_TRANSACTION_CONFLICT: [409, "微信支付订单号冲突"],
  BRANDING_ADDON_ORDER_STATUS_INVALID: [409, "订单状态不允许确认支付"],
  BRANDING_ADDON_TENANT_NOT_FOUND: [404, "订单所属租户不存在"],
  BRANDING_ADDON_NOTIFICATION_MISMATCH: [409, "支付通知与订单不匹配"],
} as const;

export function mapBrandingAddonOrderConflict(error: unknown) {
  if (!isPostgresUniqueViolation(error)) return null;
  if (containsToken(error, "tenant_addon_orders_tenant_idempotency_key")) {
    return Errors.business(
      409,
      "幂等键已被使用",
      "BRANDING_ADDON_IDEMPOTENCY_KEY_CONFLICT",
    );
  }
  if (containsToken(error, "tenant_addon_orders_pending_product_unique_idx")) {
    return Errors.business(
      409,
      "已存在待支付订单",
      "BRANDING_ADDON_PENDING_ORDER_EXISTS",
    );
  }
  if (containsToken(error, "tenant_addon_orders_out_trade_no_unique_idx")) {
    return Errors.business(
      409,
      "商户订单号冲突",
      "BRANDING_ADDON_OUT_TRADE_NO_CONFLICT",
    );
  }
  return null;
}

export function mapBrandingAddonConfirmationError(error: unknown) {
  for (const [code, [status, message]] of Object.entries(CONFIRMATION_ERRORS)) {
    if (containsToken(error, code)) {
      return Errors.business(status, message, code);
    }
  }
  return null;
}

export function boundedBrandingAddonNotificationError(value: string) {
  const bounded = value.trim().slice(0, 500);
  return bounded.length > 0 ? bounded : null;
}

export function hasSameBrandingAddonNotificationIdentity(
  existing: BrandingAddonWechatNotificationRecord,
  input: BrandingAddonNotificationCreateInput,
) {
  return existing.tenant_id === input.tenant_id &&
    existing.order_id === input.order_id &&
    existing.event_type === input.event_type &&
    existing.resource_type === input.resource_type;
}

function containsToken(error: unknown, token: string) {
  if (!error || typeof error !== "object") return false;
  return ["message", "details", "hint"].some((key) => {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === "string" && value.includes(token);
  });
}
