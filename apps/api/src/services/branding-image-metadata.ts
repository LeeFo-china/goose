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
const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const PNG_CHUNK_OVERHEAD_BYTES = 12;

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

    if (metadata.format === "png") {
      assertPngHasNoAnimationControlChunk(input);
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

function assertPngHasNoAnimationControlChunk(input: Uint8Array): void {
  if (
    input.byteLength < PNG_SIGNATURE.length ||
    PNG_SIGNATURE.some((byte, index) => input[index] !== byte)
  ) {
    return invalidBrandLogo();
  }

  let offset = PNG_SIGNATURE.length;
  const inputView = new DataView(
    input.buffer,
    input.byteOffset,
    input.byteLength,
  );
  while (offset < input.byteLength) {
    const remainingBytes = input.byteLength - offset;
    if (remainingBytes < PNG_CHUNK_OVERHEAD_BYTES) {
      return invalidBrandLogo();
    }

    const chunkLength = inputView.getUint32(offset);
    const nextOffset = offset + PNG_CHUNK_OVERHEAD_BYTES + chunkLength;
    if (nextOffset > input.byteLength) {
      return invalidBrandLogo();
    }

    if (
      input[offset + 4] === 0x61 &&
      input[offset + 5] === 0x63 &&
      input[offset + 6] === 0x54 &&
      input[offset + 7] === 0x4c
    ) {
      return invalidBrandLogo();
    }

    offset = nextOffset;
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
