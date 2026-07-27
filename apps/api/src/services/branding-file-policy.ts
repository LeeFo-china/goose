import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { BrandingPlatformFileObjectRecord } from "@/repositories/platform-file-objects";

export const BRAND_LOGO_POLICY = {
  mimeTypes: new Set(["image/jpeg", "image/png", "image/webp"]),
  maxSizeBytes: 2 * 1024 * 1024,
  minWidth: 128,
  minHeight: 128,
  minAspectRatio: 0.8,
  maxAspectRatio: 1.25,
} as const;

export function assertValidBrandLogoFile(
  scope: { tenantId: string | null },
  file: BrandingPlatformFileObjectRecord | null,
): BrandingPlatformFileObjectRecord {
  if (!file || file.tenant_id !== scope.tenantId) {
    throw Errors.business(
      404,
      "品牌 Logo 文件不存在",
      ErrorCodes.BRANDING_LOGO_FILE_NOT_FOUND,
    );
  }

  const hasValidSize = Number.isFinite(file.size_bytes) &&
    Number.isInteger(file.size_bytes) &&
    file.size_bytes > 0 &&
    file.size_bytes <= BRAND_LOGO_POLICY.maxSizeBytes;
  const width = file.width;
  const height = file.height;
  const hasValidWidth = isValidDimension(width, BRAND_LOGO_POLICY.minWidth);
  const hasValidHeight = isValidDimension(height, BRAND_LOGO_POLICY.minHeight);
  const aspectRatio = hasValidWidth && hasValidHeight
    ? width / height
    : Number.NaN;

  if (
    file.scene !== "brand_logo" ||
    file.status !== "active" ||
    file.visibility !== "public" ||
    file.deleted_at !== null ||
    !BRAND_LOGO_POLICY.mimeTypes.has(file.mime_type) ||
    !hasValidSize ||
    !hasValidWidth ||
    !hasValidHeight ||
    !Number.isFinite(aspectRatio) ||
    aspectRatio < BRAND_LOGO_POLICY.minAspectRatio ||
    aspectRatio > BRAND_LOGO_POLICY.maxAspectRatio
  ) {
    return invalidBrandLogoFile();
  }

  return file;
}

function isValidDimension(value: number | null, minimum: number): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= minimum;
}

function invalidBrandLogoFile(): never {
  throw Errors.business(
    400,
    "品牌 Logo 文件无效",
    ErrorCodes.BRANDING_LOGO_FILE_INVALID,
  );
}
