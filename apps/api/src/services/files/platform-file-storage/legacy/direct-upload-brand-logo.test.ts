import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import sharp from "sharp";
import type { CompleteDirectUploadInput } from "./shared";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const OBJECT_KEY = "tenants/tenant-1/brand-logo/2026/07/27/logo.png";
const createOrFindByObjectKey = mock(async (input: Record<string, unknown>) => ({
  id: "file-brand-logo",
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

beforeAll(async () => {
  validPng = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: { r: 12, g: 88, b: 160, alpha: 1 },
    },
  }).png().toBuffer();
});

beforeEach(() => createOrFindByObjectKey.mockClear());

function brandLogoInput(
  overrides: Partial<CompleteDirectUploadInput> = {},
): CompleteDirectUploadInput {
  return {
    filename: "logo.png",
    mimetype: "image/png",
    sizeBytes: validPng.length,
    scene: "brand_logo",
    objectKey: OBJECT_KEY,
    tenantId: "tenant-1",
    employeeId: "employee-1",
    authUserId: "auth-1",
    visibility: "public",
    ...overrides,
  };
}

function storageContext(body: unknown = validPng) {
  const headObject = mock(async () => ({
    headers: {
      "content-length": String(validPng.length),
      "content-type": "image/png",
    },
    ETag: '"etag-brand-logo"',
  }));
  const getObject = mock(async () => ({
    Body: body,
    ETag: '"etag-brand-logo"',
  }));
  return {
    headObject,
    getObject,
    context: {
      getCosConfig: async () => ({
        secretKey: "secret",
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

describe("brand logo direct upload initialization", () => {
  test("signs exact size, type and overwrite guard", async () => {
    const { createDirectUpload } = await import("./direct-upload");
    const getObjectUrl = mock(() => "https://cos.example.com/signed-put");

    const response = await createDirectUpload.call({
      getStorageProvider: async () => "tencent_cos",
      getCosConfig: async () => ({
        secretKey: "secret",
        bucket: "bucket",
        region: "ap-guangzhou",
        signedUrlTtl: 600,
        uploadUseAccelerate: false,
      }),
      buildCosObjectKey: () => OBJECT_KEY,
      getCosClient: () => ({ getObjectUrl }),
      setCosAccessCache: () => undefined,
    }, brandLogoInput());

    expect(getObjectUrl).toHaveBeenCalledWith(expect.objectContaining({
      Headers: {
        "Content-Length": validPng.length,
        "Content-Type": "image/png",
        "x-cos-forbid-overwrite": true,
      },
    }));
    expect(response.headers).toEqual({
      "content-type": "image/png",
      "content-length": String(validPng.length),
      "x-cos-forbid-overwrite": true,
    });
  });
});

describe("brand logo direct upload completion", () => {
  test.each([
    ["private visibility", { visibility: "private" as const }],
    ["missing employee", { employeeId: null }],
  ])("rejects %s before COS or database access", async (_name, patch) => {
    const { registerExistingCosObject } = await import("./direct-upload");
    const { context, headObject, getObject } = storageContext();

    await expect(registerExistingCosObject.call(
      context,
      brandLogoInput(patch),
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(headObject).not.toHaveBeenCalled();
    expect(getObject).not.toHaveBeenCalled();
    expect(createOrFindByObjectKey).not.toHaveBeenCalled();
  });

  test("forces authoritative verification even when generic HEAD is disabled", async () => {
    const { completeDirectUpload } = await import("./direct-upload");
    const registerExistingCosObject = mock(async () => ({ file_id: "file-1" }));

    await completeDirectUpload.call({
      shouldVerifyDirectUploadHead: () => false,
      registerExistingCosObject,
    }, brandLogoInput());

    expect(registerExistingCosObject).toHaveBeenCalledWith(
      expect.objectContaining({ verifyHead: true, failIfMissing: true }),
    );
  });

  test("persists only decoded canonical metadata and keeps public response shape", async () => {
    const { registerExistingCosObject } = await import("./direct-upload");
    const { context, headObject, getObject } = storageContext();

    const response = await registerExistingCosObject.call(
      context,
      brandLogoInput({ etag: '"etag-brand-logo"' }),
    );

    expect(headObject).toHaveBeenCalledTimes(1);
    expect(getObject).toHaveBeenCalledTimes(1);
    expect(createOrFindByObjectKey).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        owner_type: "brand_logo",
        scene: "brand_logo",
        mime_type: "image/png",
        size_bytes: validPng.length,
        width: 128,
        height: 128,
        checksum: "etag-brand-logo",
        visibility: "public",
      }),
    );
    expect(response).toEqual({
      file_id: "file-brand-logo",
      object_key: OBJECT_KEY,
      public_url: `https://cdn.example.com/${OBJECT_KEY}`,
    });
  });

  test("does not register invalid content", async () => {
    const { registerExistingCosObject } = await import("./direct-upload");
    const { context } = storageContext(Buffer.alloc(validPng.length));

    await expect(registerExistingCosObject.call(
      context,
      brandLogoInput(),
    )).rejects.toMatchObject({
      statusCode: 400,
      code: "BRANDING_LOGO_FILE_INVALID",
    });
    expect(createOrFindByObjectKey).not.toHaveBeenCalled();
  });

  test("revalidates the current COS object on every idempotent completion", async () => {
    const { registerExistingCosObject } = await import("./direct-upload");
    const { context, headObject, getObject } = storageContext();

    await registerExistingCosObject.call(context, brandLogoInput());
    await registerExistingCosObject.call(context, brandLogoInput());

    expect(headObject).toHaveBeenCalledTimes(2);
    expect(getObject).toHaveBeenCalledTimes(2);
    expect(createOrFindByObjectKey).toHaveBeenCalledTimes(2);
  });
});
