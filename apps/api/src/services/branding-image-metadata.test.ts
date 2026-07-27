import { describe, expect, test } from "bun:test";

import { parseBrandLogoImageMetadata } from "./branding-image-metadata";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function uint16Be(value: number) {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function uint24Le(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];
}

function uint32Be(value: number) {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function uint32Le(value: number) {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

function png(width: number, height: number) {
  return new Uint8Array([
    ...PNG_SIGNATURE,
    0,
    0,
    0,
    13,
    73,
    72,
    68,
    82,
    ...uint32Be(width),
    ...uint32Be(height),
    8,
    6,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
}

function jpeg(width: number, height: number, sofMarker: 0xc0 | 0xc2) {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0,
    4,
    0,
    0,
    0xff,
    sofMarker,
    0,
    11,
    8,
    ...uint16Be(height),
    ...uint16Be(width),
    1,
    1,
    0x11,
    0,
    0xff,
    0xd9,
  ]);
}

function webp(chunkType: "VP8 " | "VP8L" | "VP8X", chunkData: number[]) {
  const padding = chunkData.length % 2;
  const riffSize = 4 + 8 + chunkData.length + padding;
  return new Uint8Array([
    82,
    73,
    70,
    70,
    ...uint32Le(riffSize),
    87,
    69,
    66,
    80,
    ...Array.from(chunkType, (character) => character.charCodeAt(0)),
    ...uint32Le(chunkData.length),
    ...chunkData,
    ...(padding ? [0] : []),
  ]);
}

function vp8(width: number, height: number) {
  return webp("VP8 ", [
    0,
    0,
    0,
    0x9d,
    0x01,
    0x2a,
    width & 0xff,
    (width >>> 8) & 0x3f,
    height & 0xff,
    (height >>> 8) & 0x3f,
  ]);
}

function vp8l(width: number, height: number, version = 0) {
  const dimensions = ((width - 1) | ((height - 1) << 14) | (version << 29)) >>> 0;
  return webp("VP8L", [0x2f, ...uint32Le(dimensions)]);
}

function vp8x(width: number, height: number) {
  return webp("VP8X", [
    0,
    0,
    0,
    0,
    ...uint24Le(width - 1),
    ...uint24Le(height - 1),
  ]);
}

function expectInvalid(bytes: Uint8Array) {
  let caught: unknown;
  try {
    parseBrandLogoImageMetadata(bytes);
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({
    statusCode: 400,
    code: "BRANDING_LOGO_FILE_INVALID",
  });
}

describe("parseBrandLogoImageMetadata", () => {
  test("reads PNG IHDR dimensions", () => {
    expect(parseBrandLogoImageMetadata(png(256, 320))).toEqual({
      mimeType: "image/png",
      width: 256,
      height: 320,
    });
  });

  test.each([
    ["baseline SOF0", 0xc0],
    ["progressive SOF2", 0xc2],
  ] as const)("reads JPEG %s dimensions", (_name, marker) => {
    expect(parseBrandLogoImageMetadata(jpeg(640, 480, marker))).toEqual({
      mimeType: "image/jpeg",
      width: 640,
      height: 480,
    });
  });

  test("reads lossy VP8 dimensions", () => {
    expect(parseBrandLogoImageMetadata(vp8(320, 240))).toEqual({
      mimeType: "image/webp",
      width: 320,
      height: 240,
    });
  });

  test("reads lossless VP8L dimensions", () => {
    expect(parseBrandLogoImageMetadata(vp8l(512, 384))).toEqual({
      mimeType: "image/webp",
      width: 512,
      height: 384,
    });
  });

  test("reads extended VP8X dimensions", () => {
    expect(parseBrandLogoImageMetadata(vp8x(1024, 768))).toEqual({
      mimeType: "image/webp",
      width: 1024,
      height: 768,
    });
  });

  test("preserves each format maximum encoded dimensions", () => {
    expect(parseBrandLogoImageMetadata(png(0xffffffff, 0xffffffff)))
      .toMatchObject({ width: 0xffffffff, height: 0xffffffff });
    expect(parseBrandLogoImageMetadata(jpeg(0xffff, 0xffff, 0xc0)))
      .toMatchObject({ width: 0xffff, height: 0xffff });
    expect(parseBrandLogoImageMetadata(vp8x(0x1000000, 0x1000000)))
      .toMatchObject({ width: 0x1000000, height: 0x1000000 });
  });

  test.each([
    ["PNG width", png(0, 256)],
    ["PNG height", png(256, 0)],
    ["JPEG width", jpeg(0, 256, 0xc0)],
    ["JPEG height", jpeg(256, 0, 0xc2)],
    ["VP8 width", vp8(0, 256)],
    ["VP8 height", vp8(256, 0)],
  ])("rejects zero %s", (_name, bytes) => {
    expectInvalid(bytes);
  });

  test.each([
    ["unsupported magic", new Uint8Array([71, 73, 70, 56])],
    ["truncated PNG", png(256, 256).slice(0, 24)],
    [
      "PNG with wrong first chunk",
      new Uint8Array([
        ...PNG_SIGNATURE,
        0,
        0,
        0,
        13,
        73,
        68,
        65,
        84,
        ...new Array(17).fill(0),
      ]),
    ],
    ["JPEG with no SOF", new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    [
      "JPEG with invalid segment length",
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1]),
    ],
    ["truncated JPEG SOF", jpeg(256, 256, 0xc0).slice(0, 16)],
    [
      "WebP whose RIFF length exceeds the bytes",
      new Uint8Array([
        82,
        73,
        70,
        70,
        100,
        0,
        0,
        0,
        87,
        69,
        66,
        80,
      ]),
    ],
    [
      "VP8 with corrupt key-frame signature",
      webp("VP8 ", [0, 0, 0, 0, 0, 0, 0, 1, 0, 1]),
    ],
    ["VP8L with unsupported version bits", vp8l(256, 256, 1)],
    [
      "VP8X with non-zero reserved bytes",
      webp("VP8X", [0, 1, 0, 0, ...uint24Le(255), ...uint24Le(255)]),
    ],
  ])("rejects %s", (_name, bytes) => {
    expectInvalid(bytes);
  });
});
