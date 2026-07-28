import type {
  TenantBrandingAddonOrderDetailRecord,
  TenantBrandingAddonOrderListRecord,
} from "@/repositories/branding-addon-orders";
import type { BrandingAddonProductRecord } from "@/repositories/branding-addon-products";
import type { TenantEntitlementRecord } from "@/repositories/tenant-entitlements";

type TenantOrderViewRecord =
  | TenantBrandingAddonOrderListRecord
  | TenantBrandingAddonOrderDetailRecord;

export function toTenantBrandingAddonProductView(
  product: BrandingAddonProductRecord,
  entitlement: TenantEntitlementRecord | null,
) {
  return {
    code: product.code,
    entitlement_code: product.entitlement_code,
    name: product.name,
    amount_fen: product.amount_fen,
    term_years: product.term_years,
    purchase_notes: product.purchase_notes,
    refund_policy: product.refund_policy,
    purchase_action: buildPurchaseAction(entitlement),
  };
}

export function toTenantBrandingAddonOrderView(
  order: TenantOrderViewRecord,
  entitlement: TenantEntitlementRecord | null,
  now: Date,
) {
  return {
    id: order.id,
    order_no: order.order_no,
    product_code: order.product_code,
    product_name: order.product_name,
    amount_fen: order.amount_fen,
    term_years: order.term_years,
    status: order.status,
    paid_at: order.paid_at,
    expires_at: order.payment_expires_at,
    entitlement: buildOrderEntitlement(order, entitlement),
    payment_action: buildPaymentAction(order, entitlement, now),
    created_at: order.created_at,
    updated_at: order.updated_at,
    ...("purchase_notes" in order
      ? {
        purchase_notes: order.purchase_notes,
        refund_policy: order.refund_policy,
        paid_amount_fen: order.paid_amount_fen,
      }
      : {}),
  };
}

function buildPurchaseAction(entitlement: TenantEntitlementRecord | null) {
  if (entitlement?.status === "suspended") {
    return {
      enabled: false,
      disabled_reason: "ENTITLEMENT_SUSPENDED",
    };
  }
  if (entitlement?.status === "revoked") {
    return {
      enabled: false,
      disabled_reason: "ENTITLEMENT_REVOKED",
    };
  }
  return { enabled: true, disabled_reason: null };
}

function buildPaymentAction(
  order: TenantOrderViewRecord,
  entitlement: TenantEntitlementRecord | null,
  now: Date,
) {
  if (order.status === "paid") {
    return { enabled: false, disabled_reason: "ORDER_ALREADY_PAID" };
  }
  if (order.status === "closed") {
    return { enabled: false, disabled_reason: "ORDER_CLOSED" };
  }
  if (order.status === "failed") {
    return { enabled: false, disabled_reason: "ORDER_FAILED" };
  }
  if (entitlement?.status === "suspended") {
    return { enabled: false, disabled_reason: "ENTITLEMENT_SUSPENDED" };
  }
  if (entitlement?.status === "revoked") {
    return { enabled: false, disabled_reason: "ENTITLEMENT_REVOKED" };
  }
  const expiresAt = Date.parse(order.payment_expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    return { enabled: false, disabled_reason: "ORDER_PAYMENT_EXPIRED" };
  }
  return { enabled: true, disabled_reason: null };
}

function buildOrderEntitlement(
  order: TenantOrderViewRecord,
  entitlement: TenantEntitlementRecord | null,
) {
  if (
    !entitlement ||
    entitlement.source_type !== "purchase" ||
    entitlement.source_id !== order.id
  ) {
    return null;
  }
  return {
    starts_at: entitlement.starts_at,
    expires_at: entitlement.expires_at,
    status: entitlement.status,
    source: entitlement.source_type,
    order_no: order.order_no,
  };
}
