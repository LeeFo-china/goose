import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { BrandingPlatformFileObjectRecord } from "@/repositories/platform-file-objects";
import {
  resolveSignedStoredFileUrl,
  resolveStoredFileUrl,
} from "@/services/files/file-url-resolver";

export const BRAND_LOGO_POLICY = {
  mimeTypes: new Set(["image/jpeg", "image/png", "image/webp"]),
  maxSizeBytes: 2 * 1024 * 1024,
  minWidth: 128,
  minHeight: 128,
  minAspectRatio: 0.8,
  maxAspectRatio: 1.25,
} as const;

export function assertBrandLogoUploadDeclaration(input: {
  mimeType: string;
  sizeBytes: number;
}): void {
  if (!hasValidBrandLogoUploadDeclaration(input)) {
    invalidBrandLogoFile();
  }
}

export function assertBrandLogoImageProperties(input: {
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}): void {
  if (!hasValidBrandLogoImageProperties(input)) {
    invalidBrandLogoFile();
  }
}

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

  if (
    file.scene !== "brand_logo" ||
    file.status !== "active" ||
    file.visibility !== "public" ||
    file.deleted_at !== null ||
    !hasValidBrandLogoFileProperties(file)
  ) {
    return invalidBrandLogoFile();
  }

  return file;
}

export async function resolveBrandLogoUrl(
  file: BrandingPlatformFileObjectRecord,
): Promise<string | null> {
  if (file.provider === "tencent_cos") {
    return resolveSignedStoredFileUrl(file.object_key);
  }
  return resolveStoredFileUrl(file.public_url);
}

function hasValidBrandLogoFileProperties(
  file: Pick<
    BrandingPlatformFileObjectRecord,
    "mime_type" | "size_bytes" | "width" | "height" | "public_url"
  >,
): boolean {
  return hasValidPublicHttpUrl(file.public_url) &&
    hasValidBrandLogoImageProperties({
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      width: file.width,
      height: file.height,
    });
}

function hasValidBrandLogoImageProperties(input: {
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}): boolean {
  if (
    !hasValidBrandLogoUploadDeclaration(input) ||
    !isValidDimension(input.width, BRAND_LOGO_POLICY.minWidth) ||
    !isValidDimension(input.height, BRAND_LOGO_POLICY.minHeight)
  ) return false;
  const aspectRatio = input.width / input.height;
  return aspectRatio >= BRAND_LOGO_POLICY.minAspectRatio &&
    aspectRatio <= BRAND_LOGO_POLICY.maxAspectRatio;
}

function hasValidBrandLogoUploadDeclaration(input: {
  mimeType: string;
  sizeBytes: number;
}): boolean {
  return BRAND_LOGO_POLICY.mimeTypes.has(input.mimeType) &&
    Number.isSafeInteger(input.sizeBytes) &&
    input.sizeBytes > 0 &&
    input.sizeBytes <= BRAND_LOGO_POLICY.maxSizeBytes;
}

function isValidDimension(value: number | null, minimum: number): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= minimum;
}

function hasValidPublicHttpUrl(value: string | null): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    /\s/u.test(value) ||
    !/^https?:\/\/[^/?#\s]+(?:[/?#]|$)/iu.test(value)
  ) return false;

  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

function invalidBrandLogoFile(): never {
  throw Errors.business(
    400,
    "品牌 Logo 文件无效",
    ErrorCodes.BRANDING_LOGO_FILE_INVALID,
  );
}
