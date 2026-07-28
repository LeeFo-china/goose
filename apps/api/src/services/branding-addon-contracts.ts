export const BRANDING_ADDON_PRODUCT_CODE =
  "custom_support_branding_annual" as const;

export const BRANDING_ADDON_TERM_YEARS = 1;

export const BRANDING_ADDON_PAYMENT_WINDOW_MS = 5 * 60 * 1000;

export const BRANDING_ADDON_REFUND_POLICY =
  "数字权益支付成功并开通后不支持退款";

export const MAX_POSTGRES_INTEGER_FEN = 2_147_483_647;

export const BRANDING_ADDON_ORDER_STATUSES = [
  "pending",
  "paid",
  "closed",
  "failed",
] as const;

export type BrandingAddonOrderStatus =
  (typeof BRANDING_ADDON_ORDER_STATUSES)[number];
