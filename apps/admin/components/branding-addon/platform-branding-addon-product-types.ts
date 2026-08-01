import type {
  BrandingPurchaseMode,
  BrandingVirtualFulfillmentStatus,
  BrandingVirtualPaymentEnvironment,
  BrandingVirtualPaymentPlatform,
  BrandingVirtualPaymentStatus,
  BrandingVirtualRefundStatus,
} from "@gooes/domain";

export interface PlatformBrandingAddonProduct {
  code: string;
  entitlement_code: string;
  name: string;
  amount_fen: number | null;
  term_years: number;
  purchase_notes: string;
  enabled: boolean;
  purchase_mode: BrandingPurchaseMode;
  version: number;
}

export type PlatformBrandingVirtualProductStatus =
  | "draft"
  | "active"
  | "disabled";

export type PlatformBrandingVirtualProductValidationStatus =
  | "pending"
  | "valid"
  | "invalid";

export interface PlatformBrandingVirtualProduct {
  environment: BrandingVirtualPaymentEnvironment;
  app_id: string;
  virtual_merchant_id: string;
  offer_id: string;
  provider_product_id: string;
  expected_amount_fen: number;
  encrypted_secret_ref:
    | "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE"
    | "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE";
  secret_revision: number;
  status: PlatformBrandingVirtualProductStatus;
  validation_status: PlatformBrandingVirtualProductValidationStatus;
  validated_at: string | null;
  version: number;
}

export interface PlatformBrandingVirtualProductSummary {
  environment: BrandingVirtualPaymentEnvironment;
  mapping: PlatformBrandingVirtualProduct | null;
  secret: {
    key: string;
    revision: number | null;
    configured: boolean;
  };
}

export interface PlatformBrandingAddonProductResult {
  product: PlatformBrandingAddonProduct;
  virtual_products?: PlatformBrandingVirtualProductSummary[];
  virtual_product?: PlatformBrandingVirtualProduct;
}

export interface PlatformBrandingAddonProductFormValues {
  name: string;
  amountYuan: string;
  purchaseNotes: string;
  enabled: boolean;
}

export interface PlatformBrandingAddonProductPatch {
  name: string;
  amount_fen?: number;
  purchase_notes: string;
  enabled: boolean;
  version: number;
}

export interface PlatformBrandingEntitlementOrder {
  id: string;
  tenant_id: string;
  order_no: string;
  product_code: string;
  product_name: string;
  amount_fen: number;
  term_years: number;
  status: "pending" | "paid" | "closed" | "failed";
  payment_channel: "legacy_direct" | "wechat_virtual";
  payment_platform: BrandingVirtualPaymentPlatform;
  payment_status: BrandingVirtualPaymentStatus;
  fulfillment_status: BrandingVirtualFulfillmentStatus;
  refund_status: BrandingVirtualRefundStatus;
  payment_expires_at: string;
  paid_at: string | null;
  closed_at: string | null;
  failure_code: string | null;
  created_at: string;
  updated_at: string;
  tenant: {
    id: string;
    name: string | null;
    slug: string | null;
  };
}

export type PlatformBrandingVirtualRefundStatus = Exclude<
  BrandingVirtualRefundStatus,
  "none"
>;

export interface PlatformBrandingVirtualRefund {
  id: string;
  refund_no: string;
  order_id: string;
  tenant_id: string;
  amount_fen: number;
  reason: string;
  evidence_summary: string;
  request_source: "platform_admin" | "apple_notification";
  platform_mode: "merchant_initiated" | "apple_external";
  status: PlatformBrandingVirtualRefundStatus;
  provider_refund_id: string | null;
  provider_refund_no?: string | null;
  provider_refund_transaction_id: string | null;
  provider_request_id: string | null;
  submitted_at: string | null;
  succeeded_at: string | null;
  failed_at: string | null;
  rejected_at: string | null;
  last_error_code: string | null;
  last_error_summary: string | null;
  compensation_status: "pending" | "succeeded" | "failed";
  compensation_last_error: string | null;
  reconcile_attempt_count: number;
  version: number;
  created_at: string;
  updated_at: string;
  tenant_name: string;
  out_trade_no: string;
  provider_order_type: 0 | 7;
  provider_channel: "merchant" | "apple";
  environment: BrandingVirtualPaymentEnvironment;
  product_name: string;
}

export interface PlatformBrandingVirtualRefundDetail
  extends Omit<
    PlatformBrandingVirtualRefund,
    "tenant_name" | "out_trade_no" | "provider_order_type" |
      "provider_channel" | "environment" | "product_name"
  > {
  order: {
    out_trade_no: string;
    provider_order_type: 0 | 7;
    provider_channel: "merchant" | "apple";
    environment: BrandingVirtualPaymentEnvironment;
    provider_order_no: string | null;
    transaction_id: string | null;
    payment_status: BrandingVirtualPaymentStatus;
    fulfillment_status: BrandingVirtualFulfillmentStatus;
    refund_status: BrandingVirtualRefundStatus;
    paid_amount_fen: number | null;
    paid_at: string | null;
  };
}

export interface PlatformBrandingPageData<RecordType> {
  list: RecordType[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
