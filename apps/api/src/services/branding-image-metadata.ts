import sharp from "sharp";

import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";

import { BRAND_LOGO_POLICY } from "./branding-file-policy";

export type BrandLogoImageMetadata = {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
};

// Keep decode memory bounded even when a tiny compressed input declares huge dimensions.
const BRAND_LOGO_MAX_INPUT_PIXELS = 4096 * 4096;
const SHARP_INPUT_OPTIONS = {
  failOn: "error",
  limitInputPixels: BRAND_LOGO_MAX_INPUT_PIXELS,
} as const;

export async function parseBrandLogoImageMetadata(
  bytes: Uint8Array,
): Promise<BrandLogoImageMetadata> {
  try {
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > BRAND_LOGO_POLICY.maxSizeBytes
    ) {
      return invalidBrandLogo();
    }

    const input = Buffer.from(bytes);
    const metadata = await sharp(input, SHARP_INPUT_OPTIONS).metadata();
    const mimeType = canonicalMimeType(metadata.format);
    const width = metadata.width;
    const height = metadata.height;
    if (
      !mimeType ||
      !isPositiveInteger(width) ||
      !isPositiveInteger(height) ||
      (metadata.pages !== undefined && metadata.pages > 1) ||
      (metadata.pageHeight !== undefined && metadata.pageHeight !== height)
    ) {
      return invalidBrandLogo();
    }

    await sharp(input, SHARP_INPUT_OPTIONS)
      .resize(1, 1, { fit: "fill" })
      .raw()
      .toBuffer();

    return { mimeType, width, height };
  } catch (error) {
    if (
      error instanceof AppError &&
      error.code === ErrorCodes.BRANDING_LOGO_FILE_INVALID
    ) {
      throw error;
    }
    return invalidBrandLogo();
  }
}

function canonicalMimeType(
  format: string | undefined,
): BrandLogoImageMetadata["mimeType"] | null {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return null;
  }
}

function isPositiveInteger(value: number | undefined): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0;
}

function invalidBrandLogo(): never {
  throw Errors.business(
    400,
    "品牌 Logo 文件无效",
    ErrorCodes.BRANDING_LOGO_FILE_INVALID,
  );
}
