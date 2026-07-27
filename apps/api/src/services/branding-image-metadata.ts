import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";

export type BrandLogoImageMetadata = {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
};

export function parseBrandLogoImageMetadata(
  bytes: Uint8Array,
): BrandLogoImageMetadata {
  if (matches(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) {
    return parsePng(bytes);
  }
  if (matches(bytes, 0, [0xff, 0xd8])) {
    return parseJpeg(bytes);
  }
  if (
    matches(bytes, 0, [82, 73, 70, 70]) &&
    matches(bytes, 8, [87, 69, 66, 80])
  ) {
    return parseWebp(bytes);
  }
  return invalidBrandLogo();
}

function parsePng(bytes: Uint8Array): BrandLogoImageMetadata {
  requireRange(bytes, 0, 33);
  if (
    readUint32Be(bytes, 8) !== 13 ||
    !matches(bytes, 12, [73, 72, 68, 82])
  ) {
    return invalidBrandLogo();
  }

  return createMetadata(
    "image/png",
    readUint32Be(bytes, 16),
    readUint32Be(bytes, 20),
  );
}

function parseJpeg(bytes: Uint8Array): BrandLogoImageMetadata {
  let offset = 2;

  while (offset < bytes.length) {
    if (readByte(bytes, offset) !== 0xff) return invalidBrandLogo();
    while (offset < bytes.length && readByte(bytes, offset) === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) return invalidBrandLogo();

    const marker = readByte(bytes, offset);
    offset += 1;
    if (marker === 0xd9 || marker === 0xda || marker === 0x00) {
      return invalidBrandLogo();
    }
    if (isStandaloneJpegMarker(marker)) continue;

    requireRange(bytes, offset, 2);
    const segmentLength = readUint16Be(bytes, offset);
    if (segmentLength < 2) return invalidBrandLogo();
    requireRange(bytes, offset, segmentLength);

    if (marker === 0xc0 || marker === 0xc2) {
      if (segmentLength < 11) return invalidBrandLogo();
      const componentCount = readByte(bytes, offset + 7);
      if (
        componentCount === 0 ||
        segmentLength !== 8 + 3 * componentCount
      ) {
        return invalidBrandLogo();
      }
      return createMetadata(
        "image/jpeg",
        readUint16Be(bytes, offset + 5),
        readUint16Be(bytes, offset + 3),
      );
    }

    offset += segmentLength;
  }

  return invalidBrandLogo();
}

function parseWebp(bytes: Uint8Array): BrandLogoImageMetadata {
  requireRange(bytes, 0, 12);
  const riffSize = readUint32Le(bytes, 4);
  const containerEnd = riffSize + 8;
  if (riffSize < 4 || containerEnd > bytes.length) {
    return invalidBrandLogo();
  }

  let offset = 12;
  while (offset < containerEnd) {
    if (containerEnd - offset < 8) return invalidBrandLogo();
    const chunkType = readAscii(bytes, offset, 4);
    const chunkSize = readUint32Le(bytes, offset + 4);
    const dataOffset = offset + 8;
    const chunkEnd = dataOffset + chunkSize;
    const paddedEnd = chunkEnd + (chunkSize % 2);
    if (chunkEnd > containerEnd || paddedEnd > containerEnd) {
      return invalidBrandLogo();
    }

    if (chunkType === "VP8 ") {
      return parseVp8(bytes, dataOffset, chunkSize);
    }
    if (chunkType === "VP8L") {
      return parseVp8l(bytes, dataOffset, chunkSize);
    }
    if (chunkType === "VP8X") {
      return parseVp8x(bytes, dataOffset, chunkSize);
    }
    offset = paddedEnd;
  }

  return invalidBrandLogo();
}

function parseVp8(
  bytes: Uint8Array,
  offset: number,
  chunkSize: number,
): BrandLogoImageMetadata {
  if (
    chunkSize < 10 ||
    (readByte(bytes, offset) & 1) !== 0 ||
    !matches(bytes, offset + 3, [0x9d, 0x01, 0x2a])
  ) {
    return invalidBrandLogo();
  }
  const width = readUint16Le(bytes, offset + 6) & 0x3fff;
  const height = readUint16Le(bytes, offset + 8) & 0x3fff;
  return createMetadata("image/webp", width, height);
}

function parseVp8l(
  bytes: Uint8Array,
  offset: number,
  chunkSize: number,
): BrandLogoImageMetadata {
  if (chunkSize < 5 || readByte(bytes, offset) !== 0x2f) {
    return invalidBrandLogo();
  }
  const packed = readUint32Le(bytes, offset + 1);
  if (((packed >>> 29) & 0x07) !== 0) return invalidBrandLogo();
  return createMetadata(
    "image/webp",
    (packed & 0x3fff) + 1,
    ((packed >>> 14) & 0x3fff) + 1,
  );
}

function parseVp8x(
  bytes: Uint8Array,
  offset: number,
  chunkSize: number,
): BrandLogoImageMetadata {
  if (
    chunkSize !== 10 ||
    (readByte(bytes, offset) & 0xc1) !== 0 ||
    readByte(bytes, offset + 1) !== 0 ||
    readByte(bytes, offset + 2) !== 0 ||
    readByte(bytes, offset + 3) !== 0
  ) {
    return invalidBrandLogo();
  }
  return createMetadata(
    "image/webp",
    readUint24Le(bytes, offset + 4) + 1,
    readUint24Le(bytes, offset + 7) + 1,
  );
}

function createMetadata(
  mimeType: BrandLogoImageMetadata["mimeType"],
  width: number,
  height: number,
): BrandLogoImageMetadata {
  if (width === 0 || height === 0) return invalidBrandLogo();
  return { mimeType, width, height };
}

function isStandaloneJpegMarker(marker: number) {
  return marker === 0x01 ||
    marker === 0xd8 ||
    (marker >= 0xd0 && marker <= 0xd7);
}

function matches(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
) {
  if (offset < 0 || offset + expected.length > bytes.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function requireRange(bytes: Uint8Array, offset: number, length: number) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > bytes.length - length
  ) {
    invalidBrandLogo();
  }
}

function readByte(bytes: Uint8Array, offset: number) {
  requireRange(bytes, offset, 1);
  const value = bytes[offset];
  return value === undefined ? invalidBrandLogo() : value;
}

function readUint16Be(bytes: Uint8Array, offset: number) {
  return readByte(bytes, offset) * 0x100 + readByte(bytes, offset + 1);
}

function readUint16Le(bytes: Uint8Array, offset: number) {
  return readByte(bytes, offset) + readByte(bytes, offset + 1) * 0x100;
}

function readUint24Le(bytes: Uint8Array, offset: number) {
  return readByte(bytes, offset) +
    readByte(bytes, offset + 1) * 0x100 +
    readByte(bytes, offset + 2) * 0x10000;
}

function readUint32Be(bytes: Uint8Array, offset: number) {
  return readByte(bytes, offset) * 0x1000000 +
    readByte(bytes, offset + 1) * 0x10000 +
    readByte(bytes, offset + 2) * 0x100 +
    readByte(bytes, offset + 3);
}

function readUint32Le(bytes: Uint8Array, offset: number) {
  return readByte(bytes, offset) +
    readByte(bytes, offset + 1) * 0x100 +
    readByte(bytes, offset + 2) * 0x10000 +
    readByte(bytes, offset + 3) * 0x1000000;
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  requireRange(bytes, offset, length);
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += String.fromCharCode(readByte(bytes, offset + index));
  }
  return result;
}

function invalidBrandLogo(): never {
  throw Errors.business(
    400,
    "品牌 Logo 文件无效",
    ErrorCodes.BRANDING_LOGO_FILE_INVALID,
  );
}
