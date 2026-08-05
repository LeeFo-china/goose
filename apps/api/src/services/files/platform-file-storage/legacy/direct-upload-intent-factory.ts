import { createApplymentUploadIntent } from "./applyment-upload-intent";
import { createDirectBrandLogoUploadIntent } from
  "./brand-logo-upload-intent";
import { createPrivateUploadIntent } from "./private-upload-intent";
import type { DirectUploadInput } from "./shared";
import { createSupplierLicenseUploadIntent } from
  "./supplier-license-upload-intent";
import { createDirectVirtualGoodsUploadIntent } from
  "./virtual-goods-upload-intent";
import { createDirectPlatformServiceFulfillmentUploadIntent } from
  "./platform-service-fulfillment-upload-intent";

export function createSceneUploadIntent(
  input: DirectUploadInput,
  context: {
    secretKey: string;
    objectKey: string;
    expiresAtSeconds: number;
    visitorId: string | null;
    isPrivateLicense: boolean;
    isApplyment: boolean;
    isSupplierLicense: boolean;
    isBrandLogo: boolean;
    isVirtualGoodsImage: boolean;
    isPlatformServiceFulfillmentAttachment: boolean;
  },
) {
  const common = {
    secretKey: context.secretKey,
    scene: input.scene,
    objectKey: context.objectKey,
    mimeType: input.mimetype,
    sizeBytes: input.sizeBytes,
    expiresAtSeconds: context.expiresAtSeconds,
  };
  if (context.isApplyment) {
    return createApplymentUploadIntent({
      ...common,
      tenantId: input.tenantId!,
    });
  }
  if (context.isSupplierLicense) {
    return createSupplierLicenseUploadIntent({
      ...common,
      employeeId: input.employeeId!,
    });
  }
  if (context.isPrivateLicense && context.visitorId) {
    return createPrivateUploadIntent({
      ...common,
      visitorId: context.visitorId,
    });
  }
  if (context.isBrandLogo) {
    return createDirectBrandLogoUploadIntent(input, context);
  }
  if (context.isVirtualGoodsImage) {
    return createDirectVirtualGoodsUploadIntent(input, context);
  }
  if (context.isPlatformServiceFulfillmentAttachment) {
    return createDirectPlatformServiceFulfillmentUploadIntent(input, context);
  }
  return undefined;
}
