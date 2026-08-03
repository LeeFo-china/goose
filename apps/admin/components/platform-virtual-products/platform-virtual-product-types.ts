import type {
  VirtualBenefitType,
  VirtualPaymentEnvironment,
  VirtualProductStatus,
} from "@gooes/domain";

export type PageData<RecordType> = {
  list: RecordType[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type VirtualProductValidationStatus =
  | "pending"
  | "valid"
  | "invalid";

export type VirtualGoodsState =
  | "not_started"
  | "processing"
  | "succeeded"
  | "failed"
  | "unknown"
  | "out_of_sync";

export type PlatformVirtualProductListItem = {
  id: string;
  code: string;
  name: string;
  product_type: VirtualBenefitType;
  amount_fen: number;
  currency: "CNY";
  status: VirtualProductStatus;
  version: number;
  updated_at: string;
};

export type PlatformVirtualProductGrantRule = {
  entitlement_code: string;
  benefit_type: VirtualBenefitType;
  grant_amount: number | null;
  duration_value: number | null;
  duration_unit: "month" | "year" | null;
  expiry_mode: "permanent" | "fixed_duration";
  expiry_value: number | null;
  expiry_unit: "month" | "year" | null;
  version: number;
};

export type PlatformVirtualPaymentChannel = {
  id: string;
  provider: "wechat_virtual";
  environment: VirtualPaymentEnvironment;
  app_id: string;
  virtual_merchant_id?: string | null;
  offer_id: string;
  status: "active" | "disabled";
  secret_revision: number;
  version: number;
};

export type PlatformVirtualProductMapping = {
  id: string;
  provider_product_id: string;
  upload_state: VirtualGoodsState;
  publish_state: VirtualGoodsState;
  validation_status: VirtualProductValidationStatus;
  synced_product_version: number | null;
  last_request_id: string | null;
  last_error_code: string | null;
  last_error_summary: string | null;
  version: number;
  updated_at: string;
  channel: PlatformVirtualPaymentChannel;
};

export type PlatformVirtualProductDetailData =
  PlatformVirtualProductListItem & {
    image_file_id: string;
    image?: { public_url?: string | null } | null;
    purchase_notes: string;
    refund_template:
      | "duration_before_fulfillment"
      | "consumable_unused_full_reverse";
    grant_rule?: PlatformVirtualProductGrantRule[] | PlatformVirtualProductGrantRule | null;
    mappings?: PlatformVirtualProductMapping[];
    created_at: string;
  };

export type PlatformVirtualProductFormValues = {
  name: string;
  productType: VirtualBenefitType;
  amountYuan: string;
  imageFileId: string;
  imagePreviewUrl: string;
  purchaseNotes: string;
  refundTemplate: "duration_before_fulfillment" | "consumable_unused_full_reverse";
  entitlementCode: string;
  durationValue: string;
  durationUnit: "month" | "year";
  grantAmount: string;
  expiryMode: "permanent" | "fixed_duration";
  expiryValue: string;
  expiryUnit: "month" | "year";
};
