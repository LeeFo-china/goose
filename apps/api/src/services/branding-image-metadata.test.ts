import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";

import { parseBrandLogoImageMetadata } from "./branding-image-metadata";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const TWO_MEBIBYTES = 2 * 1024 * 1024;

const STATIC_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAMAQMAAABRKa/CAAAAA1BMVEUzZpk7I4HSAAAAC0lEQVQI12NgIAwAACQAAS4ecaAAAAAASUVORK5CYII=";
const STATIC_JPEG =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAMABADAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCRK2l4AAD/2Q==";
const STATIC_WEBP =
  "UklGRh4AAABXRUJQVlA4TBEAAAAvD8ACAAdQs840s/+BiOh/AAA=";
const ANIMATED_WEBP =
  "UklGRsAAAABXRUJQVlA4WAoAAAACAAAADwAACwAAQU5JTQYAAAD/////AABBTk1GSAAAAAAAAAAAAA8AAAsAAGQAAAJWUDggMAAAANABAJ0BKhAADAACADQloAJ0ugH4AAOwAP7wxAv/ILlhdcjX/yA/5Af8gP/48gAAAEFOTUZEAAAAAAAAAAAADwAACwAAZAAAAFZQOCAsAAAAlAEAnQEqEAAMAAAANCWgAnS6AAOYAP75k2//kB//kB//kB//ID/iF3sgMAA=";

function fromBase64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function corruptPngCrc() {
  const bytes = fromBase64(STATIC_PNG);
  bytes[29] = (bytes[29] ?? 0) ^ 1;
  return bytes;
}

function removeJpegComponents() {
  const bytes = fromBase64(STATIC_JPEG);
  for (let offset = 0; offset < bytes.length - 9; offset += 1) {
    if (
      bytes[offset] === 0xff &&
      (bytes[offset + 1] === 0xc0 || bytes[offset + 1] === 0xc2)
    ) {
      bytes[offset + 9] = 0;
      return bytes;
    }
  }
  return bytes;
}

function uint32Be(value: number) {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function pngCrc32(bytes: readonly number[]) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: readonly number[] | Uint8Array) {
  const typeBytes = Array.from(type, (character) => character.charCodeAt(0));
  return [
    ...uint32Be(data.length),
    ...typeBytes,
    ...data,
    ...uint32Be(pngCrc32([...typeBytes, ...data])),
  ];
}

function createLargeDecodablePng() {
  const width = 4097;
  const height = 4097;
  const packedRowBytes = Math.ceil(width / 8);
  const pixels = new Uint8Array((packedRowBytes + 1) * height);
  const compressed = deflateSync(pixels, { level: 9 });
  return new Uint8Array([
    ...PNG_SIGNATURE,
    ...pngChunk("IHDR", [...uint32Be(width), ...uint32Be(height), 1, 0, 0, 0, 0]),
    ...pngChunk("IDAT", compressed),
    ...pngChunk("IEND", []),
  ]);
}

async function expectInvalid(bytes: Uint8Array) {
  await expect(parseBrandLogoImageMetadata(bytes)).rejects.toMatchObject({
    statusCode: 400,
    code: "BRANDING_LOGO_FILE_INVALID",
  });
}

describe("parseBrandLogoImageMetadata invalid inputs", () => {
  test.each([
    ["empty input", new Uint8Array()],
    ["unsupported GIF", new Uint8Array([71, 73, 70, 56, 57, 97])],
    ["truncated PNG pixel data", fromBase64(STATIC_PNG).slice(0, -20)],
    ["truncated JPEG", fromBase64(STATIC_JPEG).slice(0, -8)],
    ["truncated WebP", fromBase64(STATIC_WEBP).slice(0, -4)],
    ["PNG with an invalid chunk CRC", corruptPngCrc()],
    ["JPEG with zero frame components", removeJpegComponents()],
    [
      "structurally complete PNG with invalid pixels",
      fromBase64(
        "iVBORw0KGgoAAAANSUhEUgAAAQAAAAFACAYAAABTKqIKAAAAC0lEQVR4AQEAAP//AAAAAYnWrl8AAAAASUVORK5CYII=",
      ),
    ],
    [
      "PNG with zero-length IDAT",
      new Uint8Array([
        ...PNG_SIGNATURE,
        ...pngChunk("IHDR", [...uint32Be(16), ...uint32Be(12), 8, 6, 0, 0, 0]),
        ...pngChunk("IDAT", []),
        ...pngChunk("IEND", []),
      ]),
    ],
  ])("rejects %s", async (_name, bytes) => {
    await expectInvalid(bytes);
  });

  test("rejects inputs larger than 2 MiB before decoding", async () => {
    await expectInvalid(new Uint8Array(TWO_MEBIBYTES + 1));
  });

  test("rejects a decodable image above the pixel safety limit", async () => {
    const image = createLargeDecodablePng();
    expect(image.byteLength).toBeLessThan(TWO_MEBIBYTES);
    await expectInvalid(image);
  });

  test("rejects animated WebP", async () => {
    await expectInvalid(fromBase64(ANIMATED_WEBP));
  });
});
