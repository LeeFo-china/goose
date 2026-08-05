export const WECHAT_PAY_APPLYMENT_UPLOAD_POLICY = {
  scene: "wechat_pay_applyment",
  maxSizeBytes: 2 * 1024 * 1024,
  mimeTypes: new Set(["image/jpeg", "image/png"]),
  sizeError: "微信支付进件附件大小校验失败",
  typeError: "微信支付进件附件类型校验失败",
  checksumError: "进件附件文件校验值不一致",
} as const;

export const SUPPLIER_BUSINESS_LICENSE_UPLOAD_POLICY = {
  scene: "supplier_business_license",
  maxSizeBytes: 5 * 1024 * 1024,
  mimeTypes: new Set(["image/jpeg", "image/png"]),
  sizeError: "供应商营业执照文件大小校验失败",
  typeError: "供应商营业执照仅支持 JPEG 或 PNG",
  checksumError: "供应商营业执照文件校验值不一致",
} as const;

export const PLATFORM_SERVICE_FULFILLMENT_ATTACHMENT_UPLOAD_POLICY = {
  scene: "tenant_service_fulfillment_attachment",
  maxSizeBytes: 10 * 1024 * 1024,
  mimeTypes: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  sizeError: "履约附件文件大小校验失败",
  typeError: "履约附件仅支持 JPG、PNG、WebP 或 PDF",
  checksumError: "履约附件文件校验值不一致",
} as const;

export function getWechatPayApplymentUploadPolicy(scene: string) {
  return scene === WECHAT_PAY_APPLYMENT_UPLOAD_POLICY.scene
    ? WECHAT_PAY_APPLYMENT_UPLOAD_POLICY
    : null;
}

export function getSupplierBusinessLicenseUploadPolicy(scene: string) {
  return scene === SUPPLIER_BUSINESS_LICENSE_UPLOAD_POLICY.scene
    ? SUPPLIER_BUSINESS_LICENSE_UPLOAD_POLICY
    : null;
}

export function getPlatformServiceFulfillmentAttachmentUploadPolicy(scene: string) {
  return scene === PLATFORM_SERVICE_FULFILLMENT_ATTACHMENT_UPLOAD_POLICY.scene
    ? PLATFORM_SERVICE_FULFILLMENT_ATTACHMENT_UPLOAD_POLICY
    : null;
}
