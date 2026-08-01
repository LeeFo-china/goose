import { z } from "zod";

import { BRANDING_ADDON_PRODUCT_CODE } from "@/services/branding-addon-contracts";
import {
  VIRTUAL_FULFILLMENT_STATUSES,
  VIRTUAL_PAYMENT_ENVIRONMENTS,
  VIRTUAL_PAYMENT_PLATFORMS,
  VIRTUAL_PAYMENT_STATUSES,
  VIRTUAL_REFUND_STATUSES,
} from "@/services/branding-virtual-payment-contracts";

export const NullableBoundedText = z.string().nullable();
export const BrandingVirtualOrderRecordSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  order_no: z.string(),
  out_trade_no: z.string(),
  idempotency_key: z.uuid(),
  product_id: z.uuid(),
  product_code: z.literal(BRANDING_ADDON_PRODUCT_CODE),
  entitlement_code: z.literal("custom_support_branding"),
  product_name: z.string(),
  amount_fen: z.number().int().positive(),
  term_years: z.literal(1),
  purchase_notes: z.string(),
  refund_policy: z.string(),
  environment: z.enum(VIRTUAL_PAYMENT_ENVIRONMENTS),
  offer_id: z.string(),
  provider_product_id: z.string(),
  requested_platform: z.enum(VIRTUAL_PAYMENT_PLATFORMS),
  settlement_channel: z.enum(["wechat", "apple"]).nullable(),
  payer_openid: z.string(),
  provider_order_no: NullableBoundedText,
  transaction_id: NullableBoundedText,
  payment_status: z.enum(VIRTUAL_PAYMENT_STATUSES),
  fulfillment_status: z.enum(VIRTUAL_FULFILLMENT_STATUSES),
  refund_status: z.enum(VIRTUAL_REFUND_STATUSES),
  paid_amount_fen: z.number().int().nonnegative().nullable(),
  paid_at: z.string().nullable(),
  entitlement_event_id: z.uuid().nullable(),
  config_version: z.number().int().positive(),
  secret_revision: z.number().int().positive(),
  payment_expires_at: z.string(),
  failure_code: NullableBoundedText,
  failure_message: NullableBoundedText,
  payment_request_claim_token: z.uuid().nullable(),
  payment_request_claimed_at: z.string().nullable(),
  payment_request_claim_expires_at: z.string().nullable(),
  payment_request_issued_at: z.string().nullable(),
  payment_request_attempt_revision: z.number().int().nonnegative(),
  created_by: z.uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type BrandingVirtualOrderRecord = z.infer<
  typeof BrandingVirtualOrderRecordSchema
>;
