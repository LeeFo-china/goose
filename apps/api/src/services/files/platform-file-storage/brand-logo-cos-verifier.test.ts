import { beforeAll, describe, expect, mock, test } from "bun:test";
import type COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

import { verifyBrandLogoCosObject } from "./brand-logo-cos-verifier";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const OBJECT_KEY = "tenants/tenant-1/brand-logo/2026/07/27/logo.png";
const ANIMATED_WEBP = Buffer.from(
  "UklGRsAAAABXRUJQVlA4WAoAAAACAAAADwAACwAAQU5JTQYAAAD/////AABBTk1GSAAAAAAAAAAAAA8AAAsAAGQAAAJWUDggMAAAANABAJ0BKhAADAACADQloAJ0ugH4AAOwAP7wxAv/ILlhdcjX/yA/5Af8gP/48gAAAEFOTkZEAAAAAAAAAAAADwAACwAAZAAAAFZQOCAsAAAAlAEAnQEqEAAMAAAANCWgAnS6AAOYAP75k2//kB//kB//kB//ID/iF3sgMAA=",
  "base64",
);

let validPng: Buffer;
let validJpeg: Buffer;
let validWebp: Buffer;

beforeAll(async () => {
  validPng = await createImage(128, 128, "png");
  validJpeg = await createImage(128, 128, "jpeg");
  validWebp = await createImage(128, 128, "webp");
});

type CosClient = Pick<COS, "headObject" | "getObject">;

function createImage(
  width: number,
  height: number,
  format: "png" | "jpeg" | "webp",
) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 23, g: 98, b: 167, alpha: 1 },
    },
  }).toFormat(format).toBuffer();
}

function createCosClient(input: {
  body: Buffer;
  headLength?: string | number;
  headType?: string;
  headEtag?: string | null;
  headError?: unknown;
  getBody?: unknown;
  getError?: unknown;
}) {
  const headObject = mock(async () => {
    if (input.headError) throw input.headError;
    return {
      headers: {
        "content-length": input.headLength ?? String(input.body.length),
        "content-type": input.headType ?? "image/png",
      },
      ETag: input.headEtag === undefined ? '"etag-1"' : input.headEtag,
    };
  });
  const getObject = mock(async () => {
    if (input.getError) throw input.getError;
    return {
      Body: input.getBody === undefined ? input.body : input.getBody,
      ETag: '"etag-1"',
    };
  });
  return {
    headObject,
    getObject,
    client: { headObject, getObject } as unknown as CosClient,
  };
}

function verify(input: {
  body?: Buffer;
  declaredMimeType?: string;
  declaredSize?: number;
  clientEtag?: string | null;
  headLength?: string | number;
  headType?: string;
  headEtag?: string | null;
  headError?: unknown;
  getBody?: unknown;
  getError?: unknown;
}) {
  const body = input.body ?? validPng;
  const cos = createCosClient({
    body,
    headLength: input.headLength,
    headType: input.headType,
    headEtag: input.headEtag,
    headError: input.headError,
    getBody: input.getBody,
    getError: input.getError,
  });
  return {
    cos,
    result: verifyBrandLogoCosObject({
      cos: cos.client,
      bucket: "bucket",
      region: "ap-guangzhou",
      objectKey: OBJECT_KEY,
      declaredMimeType: input.declaredMimeType ?? "image/png",
      declaredSize: input.declaredSize ?? body.length,
      clientEtag: input.clientEtag,
    }),
  };
}

async function expectInvalid(input: Parameters<typeof verify>[0]) {
  const invocation = verify(input);
  await expect(invocation.result).rejects.toMatchObject({
    statusCode: 400,
    code: "BRANDING_LOGO_FILE_INVALID",
    details: undefined,
  });
  return invocation.cos;
}

describe("verifyBrandLogoCosObject authoritative metadata", () => {
  test.each([
    ["missing length", "", "image/png"],
    ["zero length", "0", "image/png"],
    ["fractional length", "1.5", "image/png"],
    ["oversize", String(MAX_SIZE_BYTES + 1), "image/png"],
    ["size mismatch", String(999), "image/png"],
    ["unsupported type", String(100), "image/heic"],
    ["type mismatch", String(100), "image/jpeg"],
  ])("rejects invalid HEAD %s before GET", async (
    _name,
    headLength,
    headType,
  ) => {
    const declaredSize = headLength === "100" ? 100 : validPng.length;
    const cos = await expectInvalid({
      declaredSize,
      headLength,
      headType,
    });
    expect(cos.getObject).not.toHaveBeenCalled();
  });

  test("normalizes a canonical image content type with parameters", async () => {
    const { result } = verify({ headType: " Image/PNG; charset=binary " });

    await expect(result).resolves.toMatchObject({ mimeType: "image/png" });
  });

  test("hides HEAD failures and does not download or persist details", async () => {
    const cos = await expectInvalid({
      headError: { Code: "NoSuchKey", RequestId: "sensitive-request-id" },
    });

    expect(cos.getObject).not.toHaveBeenCalled();
  });

  test("rejects a missing or mismatched authoritative ETag", async () => {
    await expectInvalid({ headEtag: null });
    await expectInvalid({ clientEtag: '"client-etag"' });
  });
});

describe("verifyBrandLogoCosObject bounded content validation", () => {
  test("downloads at most 2 MiB plus one byte with COS Range", async () => {
    const { result, cos } = verify({});

    await result;
    expect(cos.getObject).toHaveBeenCalledWith({
      Bucket: "bucket",
      Region: "ap-guangzhou",
      Key: OBJECT_KEY,
      Range: `bytes=0-${MAX_SIZE_BYTES}`,
    });
  });

  test("rejects GET errors without leaking provider details", async () => {
    await expectInvalid({
      getError: { Code: "AccessDenied", RequestId: "sensitive-request-id" },
    });
  });

  test.each([
    ["non-buffer body", "not-a-buffer"],
    ["short body", Buffer.from([1, 2, 3])],
    ["2 MiB plus one body", Buffer.alloc(MAX_SIZE_BYTES + 1)],
  ])("rejects %s", async (_name, getBody) => {
    await expectInvalid({ getBody });
  });

  test("rejects corrupt image bytes", async () => {
    const corrupt = Buffer.from(validPng);
    const pixelChunkOffset = corrupt.indexOf(Buffer.from("IDAT")) + 8;
    corrupt[pixelChunkOffset] = (corrupt[pixelChunkOffset] ?? 0) ^ 1;
    await expectInvalid({ body: corrupt });
  });

  test("rejects animated WebP and APNG content", async () => {
    await expectInvalid({
      body: ANIMATED_WEBP,
      declaredMimeType: "image/webp",
      headType: "image/webp",
    });
    const apng = addApngAnimationControlChunk(validPng);
    await expectInvalid({ body: apng });
  });

  test("rejects decoded MIME, minimum dimension and aspect ratio mismatch", async () => {
    await expectInvalid({
      body: validPng,
      declaredMimeType: "image/jpeg",
      headType: "image/jpeg",
    });
    await expectInvalid({ body: await createImage(127, 128, "png") });
    await expectInvalid({ body: await createImage(200, 128, "png") });
  });
});

describe("verifyBrandLogoCosObject successful canonical metadata", () => {
  test.each([
    ["image/png", () => validPng],
    ["image/jpeg", () => validJpeg],
    ["image/webp", () => validWebp],
  ] as const)("returns actual %s metadata", async (mimeType, getBody) => {
    const body = getBody();
    const { result } = verify({
      body,
      declaredMimeType: mimeType,
      headType: mimeType,
      clientEtag: '"etag-1"',
    });

    await expect(result).resolves.toEqual({
      mimeType,
      sizeBytes: body.length,
      width: 128,
      height: 128,
      etag: "etag-1",
    });
  });
});

function addApngAnimationControlChunk(png: Buffer): Buffer {
  const chunkType = Buffer.from("acTL");
  const chunkData = Buffer.alloc(8);
  chunkData.writeUInt32BE(2, 0);
  const crcInput = Buffer.concat([chunkType, chunkData]);
  const chunk = Buffer.alloc(20);
  chunk.writeUInt32BE(chunkData.length, 0);
  chunkType.copy(chunk, 4);
  chunkData.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(crcInput), 16);
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
