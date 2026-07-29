import type { BrandingAddonOrderStatus } from "@/services/branding-addon-contracts";

export type BrandingAddonOrderRecord = {
  id: string;
  tenant_id: string;
  order_no: string;
  out_trade_no: string;
  idempotency_key: string;
  product_id: string;
  product_code: "custom_support_branding_annual";
  entitlement_code: "custom_support_branding";
  product_name: string;
  amount_fen: number;
  term_years: 1;
  purchase_notes: string;
  refund_policy: string;
  status: BrandingAddonOrderStatus;
  channel: "wechat_pay";
  payer_openid: string;
  payment_config_id: string;
  expected_guard_version: number;
  payment_mchid: string;
  payment_appid: string;
  prepay_id: string | null;
  payment_expires_at: string;
  transaction_id: string | null;
  paid_amount_fen: number | null;
  paid_at: string | null;
  closed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  entitlement_event_id: string | null;
  created_by: string;
  metadata: Record<string, unknown>;
  close_claim_token: string | null;
  close_claim_expires_at: string | null;
  close_attempt_count: number;
  close_last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantBrandingAddonOrderListRecord = Pick<
  BrandingAddonOrderRecord,
  | "id"
  | "tenant_id"
  | "order_no"
  | "product_code"
  | "product_name"
  | "amount_fen"
  | "term_years"
  | "status"
  | "payment_expires_at"
  | "paid_at"
  | "closed_at"
  | "failure_code"
  | "failure_message"
  | "created_at"
  | "updated_at"
>;

export type TenantBrandingAddonOrderDetailRecord =
  TenantBrandingAddonOrderListRecord & Pick<
    BrandingAddonOrderRecord,
    | "entitlement_code"
    | "purchase_notes"
    | "refund_policy"
    | "paid_amount_fen"
  >;

export type PlatformBrandingAddonOrderListRecord = Pick<
  BrandingAddonOrderRecord,
  | "id"
  | "tenant_id"
  | "order_no"
  | "product_code"
  | "product_name"
  | "amount_fen"
  | "term_years"
  | "status"
  | "payment_expires_at"
  | "paid_at"
  | "closed_at"
  | "failure_code"
  | "created_at"
  | "updated_at"
> & {
  tenant?: {
    id: string;
    name: string | null;
    slug: string | null;
  } | null;
};

export type PlatformBrandingAddonOrderDetailRecord =
  PlatformBrandingAddonOrderListRecord & Pick<
    BrandingAddonOrderRecord,
    | "entitlement_code"
    | "out_trade_no"
    | "transaction_id"
    | "paid_amount_fen"
    | "purchase_notes"
    | "refund_policy"
    | "channel"
    | "failure_message"
    | "entitlement_event_id"
    | "created_by"
  >;

export type PlatformBrandingAddonOrderAuditRecord = {
  order: PlatformBrandingAddonOrderDetailRecord;
  entitlement: {
    starts_at: string;
    expires_at: string;
    status: "active" | "suspended" | "expired" | "revoked";
    source: "manual_grant" | "purchase";
    order_no: string | null;
  } | null;
  entitlement_event: {
    id: string;
    event_type:
      | "granted"
      | "renewed"
      | "suspended"
      | "resumed"
      | "expired"
      | "revoked";
    source_type: "manual_grant" | "purchase" | "system";
    source_id: string | null;
    reason: string | null;
    created_at: string;
  } | null;
  audit: {
    id: string;
    action: string;
    status: "success" | "failure";
    summary: string | null;
    created_at: string;
  } | null;
};

export type BrandingAddonPaymentOrderRecord = Pick<
  BrandingAddonOrderRecord,
  | "id"
  | "tenant_id"
  | "order_no"
  | "out_trade_no"
  | "idempotency_key"
  | "product_id"
  | "product_code"
  | "entitlement_code"
  | "product_name"
  | "amount_fen"
  | "term_years"
  | "purchase_notes"
  | "refund_policy"
  | "status"
  | "channel"
  | "payer_openid"
  | "payment_config_id"
  | "expected_guard_version"
  | "payment_mchid"
  | "payment_appid"
  | "prepay_id"
  | "payment_expires_at"
  | "transaction_id"
  | "paid_amount_fen"
  | "paid_at"
  | "closed_at"
  | "failure_code"
  | "failure_message"
  | "entitlement_event_id"
  | "created_by"
  | "created_at"
  | "updated_at"
>;

export type BrandingAddonCallbackOrderRecord = Pick<
  BrandingAddonOrderRecord,
  | "id"
  | "tenant_id"
  | "order_no"
  | "out_trade_no"
  | "product_code"
  | "entitlement_code"
  | "amount_fen"
  | "term_years"
  | "status"
  | "payment_config_id"
  | "payment_mchid"
  | "payment_appid"
  | "payment_expires_at"
  | "transaction_id"
  | "paid_amount_fen"
  | "paid_at"
  | "entitlement_event_id"
  | "created_at"
  | "updated_at"
>;

export type BrandingAddonConfirmedOrderRecord = Pick<
  BrandingAddonOrderRecord,
  | "id"
  | "tenant_id"
  | "order_no"
  | "out_trade_no"
  | "product_code"
  | "entitlement_code"
  | "amount_fen"
  | "term_years"
  | "status"
  | "transaction_id"
  | "paid_amount_fen"
  | "paid_at"
  | "entitlement_event_id"
  | "updated_at"
>;

export type BrandingAddonExpirationOrderRecord =
  BrandingAddonCallbackOrderRecord & Pick<
    BrandingAddonOrderRecord,
    | "prepay_id"
    | "expected_guard_version"
    | "close_claim_token"
    | "close_claim_expires_at"
    | "close_attempt_count"
    | "close_last_error"
  >;

export type BrandingAddonCloseResultRecord = Pick<
  BrandingAddonOrderRecord,
  | "id"
  | "tenant_id"
  | "order_no"
  | "out_trade_no"
  | "product_code"
  | "status"
  | "prepay_id"
  | "payment_expires_at"
  | "closed_at"
  | "close_claim_token"
  | "close_claim_expires_at"
  | "close_attempt_count"
  | "close_last_error"
  | "updated_at"
>;

export type BrandingAddonWechatNotificationRecord = {
  id: string;
  notify_id: string;
  tenant_id: string;
  order_id: string;
  event_type: string;
  resource_type: string;
  raw_payload: Record<string, unknown>;
  signature_valid: boolean;
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type BrandingAddonOrderCreateInput = Omit<
  BrandingAddonOrderRecord,
  | "id"
  | "prepay_id"
  | "transaction_id"
  | "paid_amount_fen"
  | "paid_at"
  | "closed_at"
  | "failure_code"
  | "failure_message"
  | "entitlement_event_id"
  | "close_claim_token"
  | "close_claim_expires_at"
  | "close_attempt_count"
  | "close_last_error"
  | "created_at"
  | "updated_at"
>;

export type BrandingAddonNotificationCreateInput = Omit<
  BrandingAddonWechatNotificationRecord,
  "id" | "processed_at" | "error_message" | "created_at" | "updated_at"
>;

export const PAYMENT_ORDER_COLUMNS = [
  "id,tenant_id,order_no,out_trade_no,idempotency_key,product_id,product_code",
  "entitlement_code,product_name,amount_fen,term_years,purchase_notes,refund_policy",
  "status,channel,payer_openid,payment_config_id,expected_guard_version",
  "payment_mchid,payment_appid,prepay_id,payment_expires_at,transaction_id",
  "paid_amount_fen,paid_at,closed_at,failure_code,failure_message",
  "entitlement_event_id,created_by,created_at,updated_at",
].join(",");

export const CALLBACK_ORDER_COLUMNS = [
  "id,tenant_id,order_no,out_trade_no,product_code,entitlement_code,amount_fen",
  "term_years,status,payment_config_id,payment_mchid,payment_appid,payment_expires_at",
  "transaction_id,paid_amount_fen,paid_at,entitlement_event_id,created_at,updated_at",
].join(",");

export const TENANT_ORDER_LIST_COLUMNS = [
  "id,tenant_id,order_no,product_code,product_name,amount_fen,term_years,status",
  "payment_expires_at,paid_at,closed_at,failure_code,failure_message",
  "created_at,updated_at",
].join(",");

export const TENANT_ORDER_DETAIL_COLUMNS = [
  TENANT_ORDER_LIST_COLUMNS,
  "entitlement_code,purchase_notes,refund_policy,paid_amount_fen",
].join(",");

export const PLATFORM_ORDER_LIST_COLUMNS = [
  "id,tenant_id,order_no,product_code,product_name,amount_fen,term_years,status",
  "payment_expires_at,paid_at,closed_at,failure_code,created_at,updated_at",
].join(",");

export const PLATFORM_ORDER_DETAIL_COLUMNS = [
  PLATFORM_ORDER_LIST_COLUMNS, "out_trade_no,transaction_id,paid_amount_fen",
  "entitlement_code,purchase_notes,refund_policy,channel,failure_message",
  "entitlement_event_id,created_by",
].join(",");

export const NOTIFICATION_COLUMNS =
  "id,notify_id,tenant_id,order_id,event_type,resource_type,raw_payload," +
  "signature_valid,processed,processed_at,error_message,created_at,updated_at";
