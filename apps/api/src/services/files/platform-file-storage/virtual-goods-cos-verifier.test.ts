import { beforeAll, describe, expect, mock, test } from "bun:test";
import type COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";

import {
  validateVirtualGoodsDirectUpload,
  verifyVirtualGoodsCosObject,
} from "./virtual-goods-cos-verifier";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const OBJECT_KEY =
  "public/branding-virtual-goods/2026/08/02/11111111-1111-4111-8111-111111111111.png";

let validPng: Buffer;
let invalidSizePng: Buffer;

beforeAll(async () => {
  validPng = await createImage(200, 200);
  invalidSizePng = await createImage(200, 199);
});

function createImage(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 245, g: 183, b: 0, alpha: 1 },
    },
  }).png().toBuffer();
}

function createCosClient(body: Buffer) {
  const headObject = mock(async () => ({
    headers: {
      "content-length": String(body.length),
      "content-type": "image/png",
    },
    ETag: '"etag-virtual-goods"',
  }));
  const getObject = mock(async () => ({
    Body: body,
    ETag: '"etag-virtual-goods"',
  }));
  return {
    headObject,
    getObject,
    client: { headObject, getObject } as unknown as Pick<
      COS,
      "headObject" | "getObject"
    >,
  };
}

describe("virtual goods direct upload declaration", () => {
  test("requires the dedicated public platform employee scene", () => {
    expect(validateVirtualGoodsDirectUpload({
      scene: "branding_virtual_goods",
      visibility: "public",
      tenantId: null,
      employeeId: "employee-1",
      mimetype: "image/png",
      sizeBytes: 100,
    })).toBe(true);

    for (const patch of [
      { visibility: "private" },
      { tenantId: "tenant-1" },
      { employeeId: null },
    ]) {
      expect(() => validateVirtualGoodsDirectUpload({
        scene: "branding_virtual_goods",
        visibility: "public",
        tenantId: null,
        employeeId: "employee-1",
        mimetype: "image/png",
        sizeBytes: 100,
        ...patch,
      })).toThrow(expect.objectContaining({
        statusCode: 403,
        code: "FORBIDDEN",
      }));
    }
  });
});

describe("verifyVirtualGoodsCosObject", () => {
  test("returns authoritative metadata for an exact 200 by 200 image", async () => {
    const cos = createCosClient(validPng);

    await expect(verifyVirtualGoodsCosObject({
      cos: cos.client,
      bucket: "bucket",
      region: "ap-guangzhou",
      objectKey: OBJECT_KEY,
      declaredMimeType: "image/png",
      declaredSize: validPng.length,
      clientEtag: '"etag-virtual-goods"',
    })).resolves.toEqual({
      mimeType: "image/png",
      sizeBytes: validPng.length,
      width: 200,
      height: 200,
      etag: "etag-virtual-goods",
    });
    expect(cos.getObject).toHaveBeenCalledWith(expect.objectContaining({
      Range: `bytes=0-${MAX_SIZE_BYTES}`,
      IfMatch: '"etag-virtual-goods"',
    }));
  });

  test("rejects images that are not exactly 200 by 200", async () => {
    const cos = createCosClient(invalidSizePng);

    await expect(verifyVirtualGoodsCosObject({
      cos: cos.client,
      bucket: "bucket",
      region: "ap-guangzhou",
      objectKey: OBJECT_KEY,
      declaredMimeType: "image/png",
      declaredSize: invalidSizePng.length,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "FILE_STORAGE_UPLOAD_FAILED",
      details: undefined,
    });
  });

  test("maps invalid COS metadata to the bounded storage error", async () => {
    const cos = createCosClient(validPng);

    await expect(verifyVirtualGoodsCosObject({
      cos: cos.client,
      bucket: "bucket",
      region: "ap-guangzhou",
      objectKey: OBJECT_KEY,
      declaredMimeType: "image/jpeg",
      declaredSize: validPng.length,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "FILE_STORAGE_UPLOAD_FAILED",
      details: undefined,
    });
  });
});
