import type {
  BrandingPurchaseMode,
  BrandingVirtualPaymentEnvironment,
} from "@gooes/domain";

export type PlatformVirtualPaymentSettingSource =
  | "database"
  | "env"
  | "default"
  | "empty";

export type PlatformVirtualPaymentProduct = {
  code: string;
  entitlement_code: string;
  name: string;
  amount_fen: number | null;
  term_years: number;
  purchase_notes: string;
  enabled: boolean;
  purchase_mode: BrandingPurchaseMode;
  version: number;
};

export type PlatformVirtualPaymentMappingStatus =
  | "draft"
  | "active"
  | "disabled";

export type PlatformVirtualPaymentChannelStatus =
  | "active"
  | "disabled";

export type PlatformVirtualPaymentValidationStatus =
  | "pending"
  | "valid"
  | "invalid";

export type PlatformVirtualPaymentSecretReference =
  | "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE"
  | "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE";

export type PlatformVirtualPaymentMapping = {
  environment: BrandingVirtualPaymentEnvironment;
  app_id: string;
  virtual_merchant_id: string;
  offer_id: string;
  provider_product_id: string;
  item_url: string | null;
  expected_amount_fen: number;
  encrypted_secret_ref: PlatformVirtualPaymentSecretReference;
  secret_revision: number;
  status: PlatformVirtualPaymentMappingStatus;
  validation_status: PlatformVirtualPaymentValidationStatus;
  validated_at: string | null;
  version: number;
};

export type PlatformVirtualPaymentProductSummary = {
  environment: BrandingVirtualPaymentEnvironment;
  mapping: PlatformVirtualPaymentMapping | null;
  secret: {
    key: PlatformVirtualPaymentSecretReference;
    revision: number | null;
    configured: boolean;
  };
};

export type PlatformVirtualPaymentSecretSourceStatus = {
  configured: boolean;
  source: PlatformVirtualPaymentSettingSource;
};

export type PlatformVirtualPaymentMessageStatus =
  PlatformVirtualPaymentSecretSourceStatus & { valid: boolean };

export type PlatformVirtualPaymentOriginalIdStatus =
  PlatformVirtualPaymentMessageStatus & { settings_href: string };

type PlatformVirtualPaymentMessageTokenKey = "message_token";

export type PlatformVirtualPaymentMessageAuth =
  Record<PlatformVirtualPaymentMessageTokenKey, PlatformVirtualPaymentMessageStatus> &
  { original_id: PlatformVirtualPaymentOriginalIdStatus };

export type PlatformVirtualPaymentReadinessCode =
  | "PRODUCT_DISABLED"
  | "PRODUCT_AMOUNT"
  | "PRODUCTION_MAPPING_REQUIRED"
  | "PRODUCTION_MAPPING_DISABLED"
  | "PRODUCTION_MAPPING_INVALID"
  | "PRODUCTION_MAPPING_AMOUNT_MISMATCH"
  | "PRODUCTION_MAPPING_SECRET"
  | "MESSAGE_TOKEN_MISSING"
  | "MESSAGE_TOKEN_INVALID"
  | "ORIGINAL_ID_MISSING"
  | "ORIGINAL_ID_INVALID";

export type PlatformVirtualPaymentReadiness = {
  ready: boolean;
  blockers: Array<{
    code: PlatformVirtualPaymentReadinessCode;
    message: string;
    settings_href?: string;
  }>;
};

export type PlatformVirtualPaymentSettingsView = {
  product: PlatformVirtualPaymentProduct;
  virtual_products: PlatformVirtualPaymentProductSummary[];
  virtual_secret_sources: Record<
    BrandingVirtualPaymentEnvironment,
    PlatformVirtualPaymentSecretSourceStatus
  >;
  message_auth: PlatformVirtualPaymentMessageAuth;
  readiness: PlatformVirtualPaymentReadiness;
  can_manage: boolean;
};

export type PlatformVirtualPaymentMappingPatch = {
  environment: BrandingVirtualPaymentEnvironment;
  app_id: string;
  virtual_merchant_id: string;
  offer_id: string;
  provider_product_id: string;
  item_url: string;
  expected_amount_fen: number;
  secret_revision: number;
  status: PlatformVirtualPaymentMappingStatus;
  version: number;
};

export type PlatformVirtualPaymentChannelPatch = {
  app_id: string;
  virtual_merchant_id: string;
  offer_id: string;
  secret_revision: number;
  status: PlatformVirtualPaymentChannelStatus;
  version: number;
};

export type PlatformVirtualGoodsPhaseState =
  | "not_started"
  | "processing"
  | "succeeded"
  | "failed"
  | "mismatch";

export type PlatformVirtualGoodsPhaseSummary = {
  state: PlatformVirtualGoodsPhaseState;
  task_status: 0 | 1 | 2 | 3;
  item_status: 0 | 1 | 2 | 3 | null;
  request_id: string | null;
};

export type PlatformVirtualGoodsLifecycleSnapshot = {
  environment: BrandingVirtualPaymentEnvironment;
  mapping_version: number;
  upload: PlatformVirtualGoodsPhaseSummary;
  publish: PlatformVirtualGoodsPhaseSummary;
  next_action:
    | "upload"
    | "wait_upload"
    | "publish"
    | "wait_publish"
    | "validate";
  poll_after_ms: 2_000 | null;
};

export type PlatformVirtualGoodsActionResult = {
  outcome: "accepted" | "already_processing" | "already_succeeded";
  phase: "upload" | "publish";
  environment: BrandingVirtualPaymentEnvironment;
  mapping_version: number;
  request_id: string | null;
};

export type PlatformVirtualPaymentSettingsPatch = {
  version: number;
  purchase_mode?: BrandingPurchaseMode;
  virtual_product?: PlatformVirtualPaymentMappingPatch;
};
