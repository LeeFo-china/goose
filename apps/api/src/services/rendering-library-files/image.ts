import sharp from 'sharp';

import { RENDERING_UPLOAD_MAX_BYTES } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';

export interface NormalizedRenderingSource {
  bytes: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
}

const MAX_INPUT_PIXELS = 4096 * 4096;
const SHARP_INPUT_OPTIONS = { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS } as const;
const PNG_SIGNATURE_BYTES = 8;
const PNG_CHUNK_OVERHEAD_BYTES = 12;

function rejected(): never {
  throw Errors.business(
    422,
    '请上传 10 MB 内的静态 JPEG、PNG 或 WebP 图片，图片总像素不能超过 16777216',
    'RENDERING_IMAGE_REJECTED',
  );
}

function canonicalMimeType(format: string | undefined): string | undefined {
  switch (format) {
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    default: return undefined;
  }
}

function isPositiveInteger(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function assertStaticPng(bytes: Buffer): void {
  // libvips may decode only the default APNG frame. Inspect chunk headers,
  // since animation-like text inside chunk data does not indicate animation.
  let offset = PNG_SIGNATURE_BYTES;
  while (offset < bytes.length) {
    const remaining = bytes.length - offset;
    if (remaining < PNG_CHUNK_OVERHEAD_BYTES) rejected();
    const length = bytes.readUInt32BE(offset);
    if (length > remaining - PNG_CHUNK_OVERHEAD_BYTES) rejected();
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') rejected();
    offset += PNG_CHUNK_OVERHEAD_BYTES + length;
  }
}

export async function normalizeRenderingSource(input: {
  bytes: Buffer;
  mimeType: string;
}): Promise<NormalizedRenderingSource> {
  if (input.bytes.length === 0 || input.bytes.length > RENDERING_UPLOAD_MAX_BYTES) rejected();

  try {
    const metadata = await sharp(input.bytes, SHARP_INPUT_OPTIONS).metadata();
    if (
      canonicalMimeType(metadata.format) !== input.mimeType ||
      !isPositiveInteger(metadata.width) ||
      !isPositiveInteger(metadata.height) ||
      metadata.width * metadata.height > MAX_INPUT_PIXELS ||
      (metadata.pages !== undefined && metadata.pages !== 1)
    ) rejected();
    if (metadata.format === 'png') assertStaticPng(input.bytes);

    const { data, info } = await sharp(input.bytes, SHARP_INPUT_OPTIONS)
      .rotate()
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    if (data.length === 0 || data.length > RENDERING_UPLOAD_MAX_BYTES) rejected();
    return { bytes: data, mimeType: 'image/webp', width: info.width, height: info.height };
  } catch {
    return rejected();
  }
}
