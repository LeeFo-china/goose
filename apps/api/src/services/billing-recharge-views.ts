import type {
  CreditRechargeProductRecord,
  TenantCreditOrderRecord,
} from "@/repositories/billing-recharge";

export function toProductView(product: CreditRechargeProductRecord) {
  return toProductSnapshot(product);
}

export function toProductSnapshot(product: CreditRechargeProductRecord) {
  return {
    code: product.code,
    title: product.title,
    amount_fen: product.amount_fen,
    credits: product.credits,
    bonus_credits: product.bonus_credits,
  };
}

export function toBillingRechargeOrderView(order: TenantCreditOrderRecord) {
  return {
    id: order.id,
    tenant_id: order.tenant_id,
    order_no: order.order_no,
    package_code: order.package_code,
    product_title: readProductTitle(order.metadata),
    amount_fen: order.amount_fen,
    credits: order.credits,
    bonus_credits: order.bonus_credits,
    channel: order.channel,
    status: order.status,
    paid_at: order.paid_at,
    paid_amount_fen: order.paid_amount_fen,
    out_trade_no: order.out_trade_no,
    prepay_id: order.prepay_id,
    transaction_id: order.transaction_id,
    refund_status: order.refund_status ?? null,
    refund_requested_at: order.refund_requested_at ?? null,
    refunded_at: order.refunded_at ?? null,
    refund_amount_fen: order.refund_amount_fen ?? null,
    refund_action: buildRefundAction(order),
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

function readProductTitle(metadata: Record<string, unknown>) {
  const snapshot = metadata.product_snapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const title = (snapshot as { title?: unknown }).title;
  return typeof title === "string" && title.trim() ? title : null;
}

function buildRefundAction(order: TenantCreditOrderRecord) {
  if (order.status === "refunded" || order.refund_status === "refunded") {
    return {
      enabled: false,
      label: "已退款",
      disabled_reason: "ORDER_ALREADY_REFUNDED",
      requires_reason: true,
    };
  }

  if (
    order.refund_status === "pending_review" ||
    order.refund_status === "approved" ||
    order.refund_status === "refunding"
  ) {
    return {
      enabled: false,
      label: "退款审核中",
      disabled_reason: "REFUND_REQUEST_PENDING",
      requires_reason: true,
    };
  }

  if (order.status === "pending") {
    return {
      enabled: false,
      label: "不可退款",
      disabled_reason: "ORDER_NOT_PAID",
      requires_reason: true,
    };
  }

  if (order.status === "closed") {
    return {
      enabled: false,
      label: "不可退款",
      disabled_reason: "ORDER_CLOSED",
      requires_reason: true,
    };
  }

  if (order.status === "paid") {
    return {
      enabled: true,
      label: "申请退款",
      disabled_reason: null,
      requires_reason: true,
    };
  }

  return {
    enabled: false,
    label: "申请退款",
    disabled_reason: "REFUND_REQUEST_NOT_SUPPORTED",
    requires_reason: true,
  };
}
