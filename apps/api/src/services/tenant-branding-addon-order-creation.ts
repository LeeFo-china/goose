import { randomUUID } from "node:crypto";

import { Errors } from "@/errors/error-factory";
import type {
  BrandingAddonOrderCreateInput,
  BrandingAddonPaymentOrderRecord,
} from "@/repositories/branding-addon-orders";
import type { BrandingAddonProductRecord } from "@/repositories/branding-addon-products";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { BrandingAddonCreateOrderInput } from "@/schema/branding-addon";
import { BRANDING_ADDON_REFUND_POLICY } from "@/services/branding-addon-contracts";

export function buildBrandingAddonOrderCreateInput(input: {
  actor: { tenantId: string; employeeId: string };
  input: BrandingAddonCreateOrderInput;
  payerOpenid: string;
  product: BrandingAddonProductRecord & { amount_fen: number };
  config: PlatformPaymentConfigRecord & {
    merchant_id: string;
    app_id: string;
  };
  guardVersion: number;
  tradeNo: string;
  expiresAt: string;
}): BrandingAddonOrderCreateInput {
  return {
    tenant_id: input.actor.tenantId,
    order_no: input.tradeNo,
    out_trade_no: input.tradeNo,
    idempotency_key: input.input.idempotency_key,
    product_id: input.product.id,
    product_code: input.product.code,
    entitlement_code: input.product.entitlement_code,
    product_name: input.product.name,
    amount_fen: input.product.amount_fen,
    term_years: input.product.term_years,
    purchase_notes: input.product.purchase_notes,
    refund_policy: BRANDING_ADDON_REFUND_POLICY,
    status: "pending",
    channel: "wechat_pay",
    payer_openid: input.payerOpenid,
    payment_config_id: input.config.id,
    expected_guard_version: input.guardVersion,
    payment_mchid: input.config.merchant_id,
    payment_appid: input.config.app_id,
    payment_expires_at: input.expiresAt,
    created_by: input.actor.employeeId,
    metadata: { product_version: input.product.version },
  };
}

export function assertBrandingAddonOrderPayerMatches(
  order: BrandingAddonPaymentOrderRecord,
  payerOpenid: string,
) {
  if (order.payer_openid !== payerOpenid) {
    throw Errors.business(
      409,
      "该年度品牌权益订单已绑定其他付款人",
      "BRANDING_ADDON_ORDER_PAYER_MISMATCH",
    );
  }
}

export function createBrandingAddonTradeNo() {
  const time = new Date().toISOString().replace(/\D/g, "").slice(0, 17);
  const nonce = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `BA${time}${nonce}`;
}
