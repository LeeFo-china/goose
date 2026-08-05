export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const DIRECT_UPLOAD_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  "application/pdf",
] as const;

export const DIRECT_UPLOAD_SCENES = [
  "project_log",
  "project_log_comment",
  "customer_follow_up_comment",
  "customer_service",
  "expense_request",
  "referral_payment",
  "employee_avatar",
  "customer_avatar",
  "customer_douyin_screenshot",
  "h5_marketing_page",
  "project_acceptance",
  "project_payment",
  "wechat_pay_applyment",
  "picture_library",
  "picture_comment",
  "tenant_onboarding_license",
  "supplier_business_license",
  "brand_logo",
  "branding_virtual_goods",
  "tenant_service_fulfillment_attachment",
] as const;

export type UploadScene = (typeof DIRECT_UPLOAD_SCENES)[number];

export const PUBLIC_DIRECT_UPLOAD_SCENES = new Set<UploadScene>([
  "h5_marketing_page",
  "picture_library",
  "picture_comment",
  "brand_logo",
  "branding_virtual_goods",
]);

export const PRIVATE_DIRECT_UPLOAD_SCENES = new Set<UploadScene>([
  "tenant_onboarding_license",
  "wechat_pay_applyment",
  "supplier_business_license",
  "tenant_service_fulfillment_attachment",
]);

export const SENSITIVE_DIRECT_UPLOAD_LOG_SCENES = new Set<UploadScene>([
  "wechat_pay_applyment",
  "supplier_business_license",
  "tenant_service_fulfillment_attachment",
]);
