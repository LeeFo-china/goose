import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import sharp from "sharp";

import type { CompleteDirectUploadInput } from "./shared";
import { createVirtualGoodsUploadIntent } from "./virtual-goods-upload-intent";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const OBJECT_KEY =
  "public/branding-virtual-goods/2026/08/02/11111111-1111-4111-8111-111111111111.png";
const SECRET_KEY = "secret";
const createOrFindByObjectKey = mock(async (input: Record<string, unknown>) => ({
  id: "file-virtual-goods",
  provider: "tencent_cos",
  bucket: "bucket",
  region: "ap-guangzhou",
  object_key: input.object_key,
  public_url: input.public_url,
  status: "active",
}));

mock.module("@/repositories/platform-file-objects", () => ({
  platformFileObjectRepository: { createOrFindByObjectKey },
}));

let validPng: Buffer;
let invalidSizePng: Buffer;

beforeAll(async () => {
  validPng = await createImage(200, 200);
  invalidSizePng = await createImage(200, 199);
});

beforeEach(() => createOrFindByObjectKey.mockClear());

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

function uploadIntent(sizeBytes = validPng.length) {
  return createVirtualGoodsUploadIntent({
    secretKey: SECRET_KEY,
    scene: "branding_virtual_goods",
    tenantId: null,
    employeeId: "employee-platform",
    objectKey: OBJECT_KEY,
    mimeType: "image/png",
    sizeBytes,
    expiresAtSeconds: Math.floor(Date.now() / 1000) + 600,
  });
}

function uploadInput(
  overrides: Partial<CompleteDirectUploadInput> = {},
): CompleteDirectUploadInput {
  return {
    filename: "goods.png",
    mimetype: "image/png",
    sizeBytes: validPng.length,
    scene: "branding_virtual_goods",
    objectKey: OBJECT_KEY,
    tenantId: null,
    employeeId: "employee-platform",
    authUserId: "auth-platform",
    visibility: "public",
    uploadIntent: uploadIntent(),
    ...overrides,
  };
}

function storageContext(body = validPng) {
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
    context: {
      getCosConfig: async () => ({
        secretKey: SECRET_KEY,
        bucket: "bucket",
        region: "ap-guangzhou",
        publicBaseUrl: "https://cdn.example.com",
      }),
      getCosClient: () => ({ headObject, getObject }),
      setCosAccessCache: () => undefined,
      buildCosPublicUrl: () => `https://cdn.example.com/${OBJECT_KEY}`,
      toUploadResponse: (input: {
        fileId: string;
        objectKey: string;
        publicUrl: string;
      }) => ({
        file_id: input.fileId,
        object_key: input.objectKey,
        public_url: input.publicUrl,
      }),
    },
  };
}

describe("virtual goods image direct upload initialization", () => {
  test("signs immutable headers and returns a scoped intent", async () => {
    const { createDirectUpload } = await import("./direct-upload");
    const getObjectUrl = mock(() => "https://cos.example.com/signed-put");

    const response = await createDirectUpload.call({
      getStorageProvider: async () => "tencent_cos",
      getCosConfig: async () => ({
        secretKey: SECRET_KEY,
        bucket: "bucket",
        region: "ap-guangzhou",
        signedUrlTtl: 600,
        uploadUseAccelerate: false,
      }),
      buildCosObjectKey: () => OBJECT_KEY,
      getCosClient: () => ({ getObjectUrl }),
      setCosAccessCache: () => undefined,
    }, uploadInput());

    expect(getObjectUrl).toHaveBeenCalledWith(expect.objectContaining({
      Headers: {
        "Content-Length": validPng.length,
        "Content-Type": "image/png",
        "x-cos-acl": "public-read",
        "x-cos-forbid-overwrite": true,
      },
    }));
    expect(response.headers).toEqual(expect.objectContaining({
      "x-cos-acl": "public-read",
    }));
    expect(response.upload_intent).toBeString();
  });
});

describe("virtual goods image direct upload completion", () => {
  test("rejects a missing intent before COS access", async () => {
    const { registerExistingCosObject } = await import("./direct-upload");
    const { context, headObject, getObject } = storageContext();

    await expect(registerExistingCosObject.call(
      context,
      uploadInput({ uploadIntent: null }),
    )).rejects.toMatchObject({
      statusCode: 400,
      code: "FILE_STORAGE_UPLOAD_FAILED",
    });
    expect(headObject).not.toHaveBeenCalled();
    expect(getObject).not.toHaveBeenCalled();
  });

  test("persists only server-decoded 200 by 200 metadata", async () => {
    const { registerExistingCosObject } = await import("./direct-upload");
    const { context } = storageContext();

    await registerExistingCosObject.call(context, uploadInput());

    expect(createOrFindByObjectKey).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: null,
        owner_type: "branding_virtual_goods",
        scene: "branding_virtual_goods",
        mime_type: "image/png",
        size_bytes: validPng.length,
        width: 200,
        height: 200,
        checksum: "etag-virtual-goods",
        visibility: "public",
      }),
    );
  });

  test("does not register an image with invalid dimensions", async () => {
    const { registerExistingCosObject } = await import("./direct-upload");
    const { context } = storageContext(invalidSizePng);

    await expect(registerExistingCosObject.call(
      context,
      uploadInput({
        sizeBytes: invalidSizePng.length,
        uploadIntent: uploadIntent(invalidSizePng.length),
      }),
    )).rejects.toMatchObject({
      statusCode: 400,
      code: "FILE_STORAGE_UPLOAD_FAILED",
    });
    expect(createOrFindByObjectKey).not.toHaveBeenCalled();
  });
});
