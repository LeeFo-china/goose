import {
  TENANT_ONBOARDING_LICENSE_MAX_SIZE_BYTES,
  TENANT_ONBOARDING_LICENSE_MIME_TYPES,
} from "./private-upload-intent";
import {
  getSupplierBusinessLicenseUploadPolicy,
  getWechatPayApplymentUploadPolicy,
} from "./direct-upload-scene-policy";
import {
  getPlatformServiceFulfillmentAttachmentPrivatePolicy,
  PLATFORM_SERVICE_FULFILLMENT_ATTACHMENT_SCENE,
} from "./platform-service-fulfillment-upload-guard";
import type { RegisterExistingCosObjectInput } from "./shared";

const PRIVATE_LICENSE_SCENE = "tenant_onboarding_license";
const PRIVATE_APPLYMENT_SCENE = "wechat_pay_applyment";
const PRIVATE_SUPPLIER_LICENSE_SCENE = "supplier_business_license";

export type PrivateHeadPolicy = {
  maxSizeBytes: number;
  mimeTypes: ReadonlySet<string>;
  sizeError: string;
  typeError: string;
  checksumError: string;
};

export function getPrivateHeadPolicy(
  input: RegisterExistingCosObjectInput,
): PrivateHeadPolicy | null {
  if (input.visibility !== "private") return null;
  if (input.scene === PRIVATE_LICENSE_SCENE) {
    return {
      maxSizeBytes: TENANT_ONBOARDING_LICENSE_MAX_SIZE_BYTES,
      mimeTypes: TENANT_ONBOARDING_LICENSE_MIME_TYPES,
      sizeError: "营业执照文件大小校验失败",
      typeError: "营业执照文件类型校验失败",
      checksumError: "营业执照文件校验值不一致",
    };
  }
  if (input.scene === PRIVATE_APPLYMENT_SCENE) {
    return getWechatPayApplymentUploadPolicy(input.scene);
  }
  if (input.scene === PRIVATE_SUPPLIER_LICENSE_SCENE) {
    return getSupplierBusinessLicenseUploadPolicy(input.scene);
  }
  if (input.scene === PLATFORM_SERVICE_FULFILLMENT_ATTACHMENT_SCENE) {
    return getPlatformServiceFulfillmentAttachmentPrivatePolicy(input);
  }
  return null;
}
