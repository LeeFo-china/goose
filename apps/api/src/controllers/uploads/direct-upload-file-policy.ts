import { Errors } from "@/errors/error-factory";
import { getWechatPayApplymentUploadPolicy } from "@/services/files/platform-file-storage";

const DEFAULT_MAX_UPLOAD_FILE_SIZE = 2 * 1024 * 1024;
const LARGE_IMAGE_MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024;
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
  const applymentPolicy = getWechatPayApplymentUploadPolicy(input.scene);
  const allowedMimeTypes = applymentPolicy?.mimeTypes ?? ALLOWED_MIME_TYPES;
  if (!allowedMimeTypes.has(input.mimetype)) {
    throw Errors.badRequest("仅支持 jpg、png、webp、heic、heif 图片");
  }

  const maxSizeBytes = applymentPolicy?.maxSizeBytes ??
    (LARGE_IMAGE_SCENES.has(input.scene)
      ? LARGE_IMAGE_MAX_UPLOAD_FILE_SIZE
      : DEFAULT_MAX_UPLOAD_FILE_SIZE);
  if (input.sizeBytes > maxSizeBytes) {
    throw Errors.badRequest(
      `单张图片不能超过 ${Math.floor(maxSizeBytes / 1024 / 1024)}MB`,
    );
  }
}
