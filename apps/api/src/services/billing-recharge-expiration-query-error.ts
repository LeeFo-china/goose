import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";

export function canCloseNonexistentWechatOrder(
  order: TenantCreditOrderRecord,
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

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
