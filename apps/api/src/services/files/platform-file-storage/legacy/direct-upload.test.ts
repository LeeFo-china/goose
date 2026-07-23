import { describe, expect, mock, test, beforeEach } from "bun:test";
import { createHash } from "node:crypto";

import {
  createPrivateUploadIntent,
  verifyPrivateUploadIntent,
} from "./private-upload-intent";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SECRET_KEY = "cos-secret-key";
const VISITOR_ID = "visitor-1";
const VISITOR_HASH = createHash("sha256").update(VISITOR_ID).digest("hex");
const OBJECT_KEY = `private/tenant-onboarding-license/visitors/${VISITOR_HASH}/`
  + "2026/07/14/license.jpg";
const MAX_SIZE = 5 * 1024 * 1024;
const APPLYMENT_MAX_SIZE = 2 * 1024 * 1024;

const createOrFindByObjectKey = mock(async (input: Record<string, unknown>) => ({
  id: "file-1",
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

beforeEach(() => createOrFindByObjectKey.mockClear());

function makeIntent(input: {
  objectKey?: string;
  visitorId?: string;
  mimeType?: string;
  sizeBytes?: number;
  expiresAtSeconds?: number;
} = {}) {
  return createPrivateUploadIntent({
    secretKey: SECRET_KEY,
    objectKey: input.objectKey ?? OBJECT_KEY,
    visitorId: input.visitorId ?? VISITOR_ID,
    mimeType: input.mimeType ?? "image/jpeg",
    sizeBytes: input.sizeBytes ?? 100,
    expiresAtSeconds: input.expiresAtSeconds ?? Math.floor(Date.now() / 1000) + 600,
  });
}

function privateInput(overrides: Record<string, unknown> = {}) {
  const input: Record<string, unknown> = {
    scene: "tenant_onboarding_license",
    objectKey: OBJECT_KEY,
    filename: "license.jpg",
    mimetype: "image/jpeg",
    sizeBytes: 100,
    visibility: "private",
    visitorId: VISITOR_ID,
    tenantId: null,
    authUserId: null,
    employeeId: null,
    customerId: null,
    verifyHead: false,
    ...overrides,
  };
  if (!("uploadIntent" in overrides)) {
    input.uploadIntent = makeIntent({
      objectKey: String(input.objectKey),
      visitorId: String(input.visitorId),
      mimeType: String(input.mimetype),
      sizeBytes: Number(input.sizeBytes),
    });
  }
  return input;
}

function privateApplymentInput(overrides: Record<string, unknown> = {}) {
  return {
    scene: "wechat_pay_applyment",
    objectKey: "tenants/tenant-1/wechat-pay-applyment/license.jpg",
    filename: "license.jpg",
    mimetype: "image/jpeg",
    sizeBytes: 100,
    visibility: "private",
    tenantId: "tenant-1",
    employeeId: "employee-1",
    verifyHead: true,
    ...overrides,
  };
}

function storageContext(headResult: unknown = {
  headers: {
    "content-length": "100",
    "content-type": "image/jpeg; charset=binary",
  },
  ETag: '"head-etag"',
}) {
  const headObject = mock(async () => headResult);
  return {
    headObject,
    context: {
      getCosConfig: async () => ({
        secretKey: SECRET_KEY,
        bucket: "bucket",
        region: "ap-guangzhou",
        publicBaseUrl: "https://cdn.example.com",
      }),
      getCosClient: () => ({ headObject }),
      setCosAccessCache: () => undefined,
      buildCosPublicUrl: () => "https://cdn.example.com/private-license.jpg",
      toUploadResponse: () => ({ url: "should-not-be-returned" }),
    },
  };
}

async function expectPrivateUploadRejected(
  input: Record<string, unknown>,
  headResult?: unknown,
) {
  const { registerExistingCosObject } = await import("./direct-upload");
  const { context } = storageContext(headResult);
  await expect(registerExistingCosObject.call(context, input as never))
    .rejects.toMatchObject({
      statusCode: 400,
      code: "FILE_STORAGE_UPLOAD_FAILED",
    });
  expect(createOrFindByObjectKey).not.toHaveBeenCalled();
}

describe("private direct upload init", () => {
  test("signs content length and returns a field-bound upload intent", async () => {
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
    }, {
      filename: "license.jpg",
      mimetype: "image/jpeg",
      sizeBytes: 100,
      scene: "tenant_onboarding_license",
      tenantId: null,
      visitorId: VISITOR_ID,
      visibility: "private",
    });

    expect(getObjectUrl).toHaveBeenCalledWith(expect.objectContaining({
      Method: "PUT",
      Headers: {
        "Content-Length": 100,
        "x-cos-forbid-overwrite": true,
      },
    }));
    expect(response.headers).toEqual({
      "content-type": "image/jpeg",
      "content-length": "100",
      "x-cos-forbid-overwrite": true,
    });
    const uploadIntent = response.upload_intent;
    expect(uploadIntent).toBeString();
    if (typeof uploadIntent !== "string") return;
    expect(verifyPrivateUploadIntent({
      token: uploadIntent,
      secretKey: SECRET_KEY,
      objectKey: OBJECT_KEY,
      visitorId: VISITOR_ID,
      mimeType: "image/jpeg",
      sizeBytes: 100,
      nowSeconds: Math.floor(Date.now() / 1000),
    })).not.toBeNull();
  });

  test("keeps public upload signing and response headers backward compatible", async () => {
    const { createDirectUpload } = await import("./direct-upload");
    const getObjectUrl = mock(() => "https://cos.example.com/public-put");
    const response = await createDirectUpload.call({
      getStorageProvider: async () => "tencent_cos",
      getCosConfig: async () => ({
        secretKey: SECRET_KEY,
        bucket: "bucket",
        region: "ap-guangzhou",
        signedUrlTtl: 600,
        uploadUseAccelerate: false,
      }),
      buildCosObjectKey: () => "tenants/tenant-1/project-payment/file.jpg",
      getCosClient: () => ({ getObjectUrl }),
      setCosAccessCache: () => undefined,
    }, {
      filename: "payment.jpg",
      mimetype: "image/jpeg",
      sizeBytes: 100,
      scene: "project_payment",
      tenantId: "tenant-1",
      visibility: "public",
    });

    expect(getObjectUrl).toHaveBeenCalledWith(
      expect.not.objectContaining({ Headers: expect.anything() }),
    );
    expect(response.headers).toEqual({ "content-type": "image/jpeg" });
    expect(response).not.toHaveProperty("upload_intent");
  });
});

describe("private direct upload completion", () => {
  test("keeps authenticated applyment files private without permanent URLs", async () => {
    const { registerExistingCosObject } = await import("./direct-upload");
    const { context, headObject } = storageContext();
    const response = await registerExistingCosObject.call(
      context,
      privateApplymentInput() as never,
    );

    expect(headObject).toHaveBeenCalledTimes(1);
    expect(createOrFindByObjectKey).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_type: "wechat_pay_applyment",
        visibility: "private",
        public_url: null,
      }),
    );
    expect(response).toEqual({ file_id: "file-1", status: "active" });
    expect(response).not.toHaveProperty("url");
    expect(response).not.toHaveProperty("public_url");
  });

  test.each([
    ["missing length", { "content-type": "image/jpeg" }],
    ["zero length", { "content-length": "0", "content-type": "image/jpeg" }],
    [
      "oversize",
      {
        "content-length": String(APPLYMENT_MAX_SIZE + 1),
        "content-type": "image/jpeg",
      },
    ],
    ["size mismatch", { "content-length": "101", "content-type": "image/jpeg" }],
    ["non-image", { "content-length": "100", "content-type": "application/pdf" }],
    ["MIME mismatch", { "content-length": "100", "content-type": "image/png" }],
  ])("rejects invalid applyment HEAD metadata: %s", async (_name, headers) => {
    await expectPrivateUploadRejected(
      privateApplymentInput(),
      { headers, ETag: '"head-etag"' },
    );
  });

  test("forces HEAD even when the environment toggle is false", async () => {
    const { completeDirectUpload } = await import("./direct-upload");
    const registerExistingCosObject = mock(async () => ({ file_id: "file-1" }));

    await completeDirectUpload.call({
      shouldVerifyDirectUploadHead: () => false,
      registerExistingCosObject,
    }, privateInput() as never);

    expect(registerExistingCosObject).toHaveBeenCalledWith(expect.objectContaining({
      verifyHead: true,
      failIfMissing: true,
    }));
  });

  test("keeps optional HEAD behavior for non-private scenes", async () => {
    const { completeDirectUpload } = await import("./direct-upload");
    const registerExistingCosObject = mock(async () => ({ file_id: "file-1" }));

    await completeDirectUpload.call({
      shouldVerifyDirectUploadHead: () => false,
      registerExistingCosObject,
    }, {
      scene: "project_payment",
      objectKey: "tenants/tenant-1/project-payment/file.jpg",
      mimetype: "image/jpeg",
      sizeBytes: 100,
      visibility: "public",
    });

    expect(registerExistingCosObject).toHaveBeenCalledWith(expect.objectContaining({
      verifyHead: false,
      failIfMissing: true,
    }));
  });

  test("persists only verified HEAD metadata and returns no permanent URL", async () => {
    const { registerExistingCosObject } = await import("./direct-upload");
    const { context, headObject } = storageContext();
    const response = await registerExistingCosObject.call(
      context,
      privateInput({ etag: '"head-etag"' }) as never,
    );

    expect(headObject).toHaveBeenCalledTimes(1);
    expect(createOrFindByObjectKey).toHaveBeenCalledWith(expect.objectContaining({
      owner_type: "visitor",
      owner_visitor_id: VISITOR_ID,
      mime_type: "image/jpeg",
      size_bytes: 100,
      checksum: "head-etag",
      visibility: "private",
      public_url: null,
      metadata: expect.objectContaining({ verified_head_object: true }),
    }));
    expect(response).toEqual({ file_id: "file-1", status: "active" });
    expect(response).not.toHaveProperty("url");
    expect(response).not.toHaveProperty("public_url");
  });

  test("rejects missing, tampered, expired and wrong-visitor intents", async () => {
    const valid = makeIntent();
    const parts = valid.split(".");
    const signature = parts[2] ?? "";
    const replacement = signature.startsWith("A") ? "B" : "A";
    const tampered = `${parts[0]}.${parts[1]}.${replacement}${signature.slice(1)}`;
    const invalidInputs = [
      privateInput({ uploadIntent: null }),
      privateInput({ uploadIntent: tampered }),
      privateInput({ uploadIntent: makeIntent({ expiresAtSeconds: 1 }) }),
      privateInput({ uploadIntent: makeIntent({ visitorId: "visitor-other" }) }),
    ];

    for (const input of invalidInputs) {
      await expectPrivateUploadRejected(input);
    }
  });

  test("rejects a valid intent whose object key has the wrong visitor prefix", async () => {
    const wrongKey = "private/tenant-onboarding-license/visitors/not-the-hash/file.jpg";
    await expectPrivateUploadRejected(privateInput({
      objectKey: wrongKey,
      uploadIntent: makeIntent({ objectKey: wrongKey }),
    }));
  });

  test("rejects a missing COS object even when HEAD verification is disabled", async () => {
    const { registerExistingCosObject } = await import("./direct-upload");
    const headObject = mock(async () => {
      throw { Code: "NoSuchKey" };
    });
    const context = {
      ...storageContext().context,
      getCosClient: () => ({ headObject }),
    };

    await expect(registerExistingCosObject.call(context, privateInput() as never))
      .rejects.toMatchObject({
        statusCode: 400,
        code: "FILE_STORAGE_UPLOAD_FAILED",
      });
    expect(headObject).toHaveBeenCalledTimes(1);
    expect(createOrFindByObjectKey).not.toHaveBeenCalled();
  });

  test.each([
    ["missing length", { "content-type": "image/jpeg" }],
    ["zero length", { "content-length": "0", "content-type": "image/jpeg" }],
    ["oversize", { "content-length": String(MAX_SIZE + 1), "content-type": "image/jpeg" }],
    ["size mismatch", { "content-length": "101", "content-type": "image/jpeg" }],
    ["non-image", { "content-length": "100", "content-type": "application/pdf" }],
    ["MIME mismatch", { "content-length": "100", "content-type": "image/png" }],
  ])("rejects invalid HEAD metadata: %s", async (_name, headers) => {
    await expectPrivateUploadRejected(
      privateInput(),
      { headers, ETag: '"head-etag"' },
    );
  });

  test("rejects a client ETag that differs from the authoritative HEAD ETag", async () => {
    await expectPrivateUploadRejected(privateInput({ etag: '"client-etag"' }));
  });
});
