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
  let offset = 8;
  let metadata: BrandLogoImageMetadata | null = null;
  let idatPayloadBytes = 0;
  let chunkIndex = 0;

  while (offset < bytes.length) {
    requireRange(bytes, offset, 12);
    const chunkLength = readUint32Be(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    requireRange(bytes, dataOffset, chunkLength + 4);
    const chunkType = readAscii(bytes, typeOffset, 4);
    const crcOffset = dataOffset + chunkLength;
    if (
      readUint32Be(bytes, crcOffset) !==
        pngCrc32(bytes, typeOffset, 4 + chunkLength)
    ) {
      return invalidBrandLogo();
    }
    const nextOffset = crcOffset + 4;

    if (chunkIndex === 0) {
      if (chunkType !== "IHDR" || chunkLength !== 13) {
        return invalidBrandLogo();
      }
      metadata = parsePngHeader(bytes, dataOffset);
    } else if (chunkType === "IHDR") {
      return invalidBrandLogo();
    }

    if (chunkType === "IDAT") idatPayloadBytes += chunkLength;
    if (chunkType === "IEND") {
      if (
        chunkLength !== 0 ||
        idatPayloadBytes === 0 ||
        !metadata ||
        nextOffset !== bytes.length
      ) {
        return invalidBrandLogo();
      }
      return metadata;
    }

    offset = nextOffset;
    chunkIndex += 1;
  }

  return invalidBrandLogo();
}

function parsePngHeader(
  bytes: Uint8Array,
  offset: number,
): BrandLogoImageMetadata {
  const width = readUint32Be(bytes, offset);
  const height = readUint32Be(bytes, offset + 4);
  const bitDepth = readByte(bytes, offset + 8);
  const colorType = readByte(bytes, offset + 9);
  if (
    width === 0 ||
    height === 0 ||
    width > 0x7fffffff ||
    height > 0x7fffffff ||
    !isValidPngColorDepth(colorType, bitDepth) ||
    readByte(bytes, offset + 10) !== 0 ||
    readByte(bytes, offset + 11) !== 0 ||
    readByte(bytes, offset + 12) > 1
  ) {
    return invalidBrandLogo();
  }
  return { mimeType: "image/png", width, height };
}

function isValidPngColorDepth(colorType: number, bitDepth: number) {
  switch (colorType) {
    case 0:
      return [1, 2, 4, 8, 16].includes(bitDepth);
    case 2:
    case 4:
    case 6:
      return [8, 16].includes(bitDepth);
    case 3:
      return [1, 2, 4, 8].includes(bitDepth);
    default:
      return false;
  }
}

function parseJpeg(bytes: Uint8Array): BrandLogoImageMetadata {
  let offset = 2;
  let metadata: BrandLogoImageMetadata | null = null;
  let hasScanPayload = false;

  while (offset < bytes.length) {
    if (readByte(bytes, offset) !== 0xff) return invalidBrandLogo();
    while (offset < bytes.length && readByte(bytes, offset) === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) return invalidBrandLogo();

    const marker = readByte(bytes, offset);
    offset += 1;
    if (marker === 0xd9) {
      if (!metadata || !hasScanPayload || offset !== bytes.length) {
        return invalidBrandLogo();
      }
      return metadata;
    }
    if (
      marker === 0x00 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      return invalidBrandLogo();
    }
    if (marker === 0x01) continue;

    requireRange(bytes, offset, 2);
    const segmentLength = readUint16Be(bytes, offset);
    if (segmentLength < 2) return invalidBrandLogo();
    requireRange(bytes, offset, segmentLength);

    if (marker === 0xda) {
      if (!metadata) return invalidBrandLogo();
      validateJpegScanHeader(bytes, offset, segmentLength);
      offset += segmentLength;
      const scan = findNextJpegMarker(bytes, offset);
      if (!scan.hasPayload) return invalidBrandLogo();
      hasScanPayload = true;
      offset = scan.markerOffset;
      continue;
    }

    if (marker === 0xc0 || marker === 0xc2) {
      if (metadata || segmentLength < 11) return invalidBrandLogo();
      const componentCount = readByte(bytes, offset + 7);
      if (
        componentCount === 0 ||
        componentCount > 4 ||
        readByte(bytes, offset + 2) !== 8 ||
        segmentLength !== 8 + 3 * componentCount
      ) {
        return invalidBrandLogo();
      }
      metadata = createMetadata(
        "image/jpeg",
        readUint16Be(bytes, offset + 5),
        readUint16Be(bytes, offset + 3),
      );
    } else if (isJpegStartOfFrame(marker)) {
      return invalidBrandLogo();
    }

    offset += segmentLength;
  }

  return invalidBrandLogo();
}

function validateJpegScanHeader(
  bytes: Uint8Array,
  offset: number,
  segmentLength: number,
) {
  if (segmentLength < 8) return invalidBrandLogo();
  const componentCount = readByte(bytes, offset + 2);
  if (
    componentCount === 0 ||
    componentCount > 4 ||
    segmentLength !== 6 + 2 * componentCount
  ) {
    return invalidBrandLogo();
  }
}

function findNextJpegMarker(bytes: Uint8Array, startOffset: number) {
  let offset = startOffset;
  let hasPayload = false;
  while (offset < bytes.length) {
    if (readByte(bytes, offset) !== 0xff) {
      hasPayload = true;
      offset += 1;
      continue;
    }

    const markerOffset = offset;
    while (offset < bytes.length && readByte(bytes, offset) === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) return invalidBrandLogo();

    const marker = readByte(bytes, offset);
    offset += 1;
    if (marker === 0x00) {
      hasPayload = true;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    return { markerOffset, hasPayload };
  }
  return invalidBrandLogo();
}

function isJpegStartOfFrame(marker: number) {
  return marker >= 0xc0 &&
    marker <= 0xcf &&
    ![0xc4, 0xc8, 0xcc].includes(marker);
}

function parseWebp(bytes: Uint8Array): BrandLogoImageMetadata {
  requireRange(bytes, 0, 12);
  const riffSize = readUint32Le(bytes, 4);
  const containerEnd = riffSize + 8;
  if (riffSize < 4 || containerEnd !== bytes.length) {
    return invalidBrandLogo();
  }

  let offset = 12;
  let canvas: BrandLogoImageMetadata | null = null;
  let image: BrandLogoImageMetadata | null = null;
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
    if (chunkSize % 2 === 1 && readByte(bytes, chunkEnd) !== 0) {
      return invalidBrandLogo();
    }

    if (chunkType === "VP8 ") {
      if (image) return invalidBrandLogo();
      image = parseVp8(bytes, dataOffset, chunkSize);
    } else if (chunkType === "VP8L") {
      if (image) return invalidBrandLogo();
      image = parseVp8l(bytes, dataOffset, chunkSize);
    } else if (chunkType === "VP8X") {
      if (canvas || image || offset !== 12) return invalidBrandLogo();
      canvas = parseVp8x(bytes, dataOffset, chunkSize);
    } else if (chunkType === "ANIM" || chunkType === "ANMF") {
      return invalidBrandLogo();
    }
    offset = paddedEnd;
  }

  if (
    !image ||
    (canvas &&
      (canvas.width !== image.width || canvas.height !== image.height))
  ) {
    return invalidBrandLogo();
  }
  return image;
}

function parseVp8(
  bytes: Uint8Array,
  offset: number,
  chunkSize: number,
): BrandLogoImageMetadata {
  const frameTag = readUint24Le(bytes, offset);
  const firstPartitionSize = frameTag >>> 5;
  if (
    chunkSize < 11 ||
    (frameTag & 1) !== 0 ||
    ((frameTag >>> 1) & 0x07) > 3 ||
    (frameTag & 0x10) === 0 ||
    firstPartitionSize === 0 ||
    10 + firstPartitionSize > chunkSize ||
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
  if (chunkSize < 6 || readByte(bytes, offset) !== 0x2f) {
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
    (readByte(bytes, offset) & 0xc3) !== 0 ||
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

function pngCrc32(bytes: Uint8Array, offset: number, length: number) {
  requireRange(bytes, offset, length);
  let crc = 0xffffffff;
  for (let index = 0; index < length; index += 1) {
    crc ^= readByte(bytes, offset + index);
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function invalidBrandLogo(): never {
  throw Errors.business(
    400,
    "品牌 Logo 文件无效",
    ErrorCodes.BRANDING_LOGO_FILE_INVALID,
  );
}
