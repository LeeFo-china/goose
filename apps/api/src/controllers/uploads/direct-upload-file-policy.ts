import { Errors } from "@/errors/error-factory";
import {
  getSupplierBusinessLicenseUploadPolicy,
  getWechatPayApplymentUploadPolicy,
} from "@/services/files/platform-file-storage/legacy/direct-upload-scene-policy";
import { assertBrandLogoUploadDeclaration } from "@/services/branding-file-policy";

const DEFAULT_MAX_UPLOAD_FILE_SIZE = 2 * 1024 * 1024;
const LARGE_IMAGE_MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024;
const VIRTUAL_GOODS_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const LARGE_IMAGE_SCENES = new Set([
  "h5_marketing_page",
  "picture_library",
  "picture_comment",
  "tenant_onboarding_license",
]);

export function assertDirectUploadFileDeclaration(input: {
  scene: string;
  mimetype: string;
  sizeBytes: number;
}) {
  if (input.scene === "brand_logo") {
    assertBrandLogoUploadDeclaration({
      mimeType: input.mimetype,
      sizeBytes: input.sizeBytes,
    });
    return;
  }
  if (input.scene === "branding_virtual_goods") {
    if (!VIRTUAL_GOODS_IMAGE_MIME_TYPES.has(input.mimetype)) {
      throw Errors.badRequest("虚拟商品图片仅支持 JPG、JPEG 或 PNG");
    }
    if (
      !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > DEFAULT_MAX_UPLOAD_FILE_SIZE
    ) {
      throw Errors.badRequest("虚拟商品图片大小必须大于 0 且不能超过 2MB");
    }
    return;
  }
  const scenePolicy = getWechatPayApplymentUploadPolicy(input.scene) ??
    getSupplierBusinessLicenseUploadPolicy(input.scene);
  const allowedMimeTypes = scenePolicy?.mimeTypes ?? ALLOWED_MIME_TYPES;
  if (!allowedMimeTypes.has(input.mimetype)) {
    throw Errors.badRequest("仅支持 jpg、png、webp、heic、heif 图片");
  }

  const maxSizeBytes = scenePolicy?.maxSizeBytes ??
    (LARGE_IMAGE_SCENES.has(input.scene)
      ? LARGE_IMAGE_MAX_UPLOAD_FILE_SIZE
      : DEFAULT_MAX_UPLOAD_FILE_SIZE);
  if (input.sizeBytes > maxSizeBytes) {
    throw Errors.badRequest(
      `单张图片不能超过 ${Math.floor(maxSizeBytes / 1024 / 1024)}MB`,
    );
  }
}
