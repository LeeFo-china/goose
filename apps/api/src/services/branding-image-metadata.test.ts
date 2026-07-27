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

function pngChunk(type: string, data: readonly number[]) {
  const typeBytes = Array.from(type, (character) => character.charCodeAt(0));
  return [
    ...uint32Be(data.length),
    ...typeBytes,
    ...data,
    ...uint32Be(pngCrc32([...typeBytes, ...data])),
  ];
}

type PngHeaderOptions = {
  bitDepth?: number;
  colorType?: number;
  compression?: number;
  filter?: number;
  interlace?: number;
};

function png(
  width: number,
  height: number,
  options: PngHeaderOptions = {},
) {
  const ihdr = [
    ...uint32Be(width),
    ...uint32Be(height),
    options.bitDepth ?? 8,
    options.colorType ?? 6,
    options.compression ?? 0,
    options.filter ?? 0,
    options.interlace ?? 0,
  ];
  return new Uint8Array([
    ...PNG_SIGNATURE,
    ...pngChunk("IHDR", ihdr),
    ...pngChunk("IDAT", [0x78, 0x01, 0x01, 0, 0, 0xff, 0xff, 0, 0, 0, 1]),
    ...pngChunk("IEND", []),
  ]);
}

function jpegHeader(width: number, height: number, sofMarker: 0xc0 | 0xc2) {
  return [
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
  ];
}

function jpeg(
  width: number,
  height: number,
  sofMarker: 0xc0 | 0xc2,
  includeScan = true,
) {
  return new Uint8Array([
    ...jpegHeader(width, height, sofMarker),
    ...(includeScan
      ? [
        0xff,
        0xda,
        0,
        8,
        1,
        1,
        0,
        0,
        63,
        0,
        0x11,
        0xff,
        0,
        0x22,
        0xff,
        0xd0,
        0x33,
      ]
      : []),
    0xff,
    0xd9,
  ]);
}

type WebpChunk = { type: string; data: number[] };

function webpChunks(chunks: readonly WebpChunk[]) {
  const payload = chunks.flatMap(({ type, data }) => [
    ...Array.from(type, (character) => character.charCodeAt(0)),
    ...uint32Le(data.length),
    ...data,
    ...(data.length % 2 ? [0] : []),
  ]);
  const riffSize = 4 + payload.length;
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
    ...payload,
  ]);
}

function webp(type: string, data: number[]) {
  return webpChunks([{ type, data }]);
}

function vp8Data(width: number, height: number) {
  return [
    0x30,
    0,
    0,
    0x9d,
    0x01,
    0x2a,
    width & 0xff,
    (width >>> 8) & 0x3f,
    height & 0xff,
    (height >>> 8) & 0x3f,
    0,
  ];
}

function vp8(width: number, height: number) {
  return webp("VP8 ", vp8Data(width, height));
}

function vp8lData(width: number, height: number, version = 0) {
  const dimensions = ((width - 1) | ((height - 1) << 14) | (version << 29)) >>> 0;
  return [0x2f, ...uint32Le(dimensions), 0];
}

function vp8l(width: number, height: number, version = 0) {
  return webp("VP8L", vp8lData(width, height, version));
}

function vp8xData(width: number, height: number, flags = 0) {
  return [
    flags,
    0,
    0,
    0,
    ...uint24Le(width - 1),
    ...uint24Le(height - 1),
  ];
}

function vp8x(width: number, height: number) {
  return webpChunks([
    { type: "VP8X", data: vp8xData(width, height) },
    { type: "VP8 ", data: vp8Data(width, height) },
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
  test("builds fixtures with the standard PNG IEND CRC", () => {
    expect(pngChunk("IEND", []).slice(-4)).toEqual([0xae, 0x42, 0x60, 0x82]);
  });

  test("reads PNG IHDR dimensions", () => {
    expect(parseBrandLogoImageMetadata(png(256, 320))).toEqual({
      mimeType: "image/png",
      width: 256,
      height: 320,
    });
  });

  test("accepts a legal grayscale PNG bit-depth combination", () => {
    expect(parseBrandLogoImageMetadata(png(256, 320, {
      bitDepth: 1,
      colorType: 0,
    }))).toMatchObject({ width: 256, height: 320 });
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
    expect(parseBrandLogoImageMetadata(png(0x7fffffff, 0x7fffffff)))
      .toMatchObject({ width: 0x7fffffff, height: 0x7fffffff });
    expect(parseBrandLogoImageMetadata(jpeg(0xffff, 0xffff, 0xc0)))
      .toMatchObject({ width: 0xffff, height: 0xffff });
    expect(parseBrandLogoImageMetadata(vp8l(0x4000, 0x4000)))
      .toMatchObject({ width: 0x4000, height: 0x4000 });
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
    ["PNG without IEND", png(256, 256).slice(0, -12)],
    [
      "PNG without IDAT",
      new Uint8Array([
        ...PNG_SIGNATURE,
        ...pngChunk("IHDR", [
          ...uint32Be(256),
          ...uint32Be(256),
          8,
          6,
          0,
          0,
          0,
        ]),
        ...pngChunk("IEND", []),
      ]),
    ],
    [
      "PNG with a non-empty IEND",
      new Uint8Array([
        ...png(256, 256).slice(0, -12),
        ...pngChunk("IEND", [0]),
      ]),
    ],
    [
      "PNG with invalid CRC",
      (() => {
        const bytes = png(256, 256);
        bytes[29] = (bytes[29] ?? 0) ^ 1;
        return bytes;
      })(),
    ],
    [
      "PNG with wrong first chunk",
      new Uint8Array([
        ...PNG_SIGNATURE,
        ...pngChunk("IDAT", [0]),
        ...pngChunk("IEND", []),
      ]),
    ],
    ["JPEG with no SOF", new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    [
      "JPEG with invalid segment length",
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1]),
    ],
    ["truncated JPEG SOF", jpeg(256, 256, 0xc0).slice(0, 16)],
    ["JPEG without EOI", jpeg(256, 256, 0xc0).slice(0, -2)],
    [
      "JPEG with a truncated scan marker",
      new Uint8Array([...jpeg(256, 256, 0xc0).slice(0, -2), 0xff]),
    ],
    [
      "JPEG with a truncated SOS segment",
      (() => {
        const bytes = jpeg(256, 256, 0xc0);
        bytes[23] = 0xff;
        bytes[24] = 0xff;
        return bytes;
      })(),
    ],
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
      "WebP whose chunk length exceeds the RIFF boundary",
      (() => {
        const bytes = vp8(256, 256);
        bytes.set(uint32Le(0xffffffff), 16);
        return bytes;
      })(),
    ],
    [
      "WebP with bytes trailing its declared RIFF",
      new Uint8Array([...vp8(256, 256), 0]),
    ],
    [
      "VP8 with corrupt key-frame signature",
      webp("VP8 ", [0x30, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0]),
    ],
    ["VP8 without partition payload", webp("VP8 ", vp8Data(256, 256).slice(0, -1))],
    ["VP8L without image payload", webp("VP8L", vp8lData(256, 256).slice(0, -1))],
    ["VP8L with unsupported version bits", vp8l(256, 256, 1)],
    [
      "PNG with unsupported compression",
      png(256, 256, { compression: 1 }),
    ],
    ["PNG with unsupported filter", png(256, 256, { filter: 1 })],
    ["PNG with unsupported interlace", png(256, 256, { interlace: 2 })],
    ["PNG with invalid bit-depth/color pair", png(256, 256, {
      bitDepth: 4,
      colorType: 6,
    })],
    ["PNG dimension above the specification limit", png(0x80000000, 256)],
    ["JPEG without a scan", jpeg(256, 256, 0xc0, false)],
    [
      "VP8X without an image chunk",
      webp("VP8X", vp8xData(256, 256)),
    ],
    [
      "VP8X with mismatched image dimensions",
      webpChunks([
        { type: "VP8X", data: vp8xData(256, 256) },
        { type: "VP8 ", data: vp8Data(255, 256) },
      ]),
    ],
    [
      "animated VP8X",
      webpChunks([
        { type: "VP8X", data: vp8xData(256, 256, 0x02) },
        { type: "ANIM", data: [0, 0, 0, 0, 0, 0] },
      ]),
    ],
    [
      "VP8X with non-zero reserved bytes",
      webp("VP8X", [0, 1, 0, 0, ...uint24Le(255), ...uint24Le(255)]),
    ],
    [
      "WebP with non-zero odd-chunk padding",
      (() => {
        const bytes = webpChunks([
          { type: "JUNK", data: [1] },
          { type: "VP8 ", data: vp8Data(256, 256) },
        ]);
        bytes[21] = 1;
        return bytes;
      })(),
    ],
  ])("rejects %s", (_name, bytes) => {
    expectInvalid(bytes);
  });

  test("walks a padded odd-sized WebP chunk before the image", () => {
    expect(parseBrandLogoImageMetadata(webpChunks([
      { type: "JUNK", data: [1] },
      { type: "VP8 ", data: vp8Data(256, 192) },
    ]))).toEqual({
      mimeType: "image/webp",
      width: 256,
      height: 192,
    });
  });
});
