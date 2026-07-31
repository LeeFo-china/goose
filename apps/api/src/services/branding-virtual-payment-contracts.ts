export {
  BRANDING_PURCHASE_MODES,
  BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN,
  VIRTUAL_FULFILLMENT_STATUSES,
  VIRTUAL_PAYMENT_ENVIRONMENTS,
  VIRTUAL_PAYMENT_PLATFORMS,
  VIRTUAL_PAYMENT_STATUSES,
  VIRTUAL_REFUND_STATUSES,
} from "@gooes/domain";

export type {
  BrandingPurchaseMode,
  BrandingVirtualFulfillmentStatus,
  BrandingVirtualPaymentEnvironment,
  BrandingVirtualPaymentPlatform,
  BrandingVirtualPaymentRequest,
  BrandingVirtualPaymentStatus,
  BrandingVirtualRefundStatus,
} from "@gooes/domain";

export const BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED =
  "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED" as const;

export const BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED =
  "BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED" as const;
