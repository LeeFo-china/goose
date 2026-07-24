import { createHash } from "node:crypto";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createSupplierLicenseUploadIntent } from "./supplier-license-upload-intent";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SECRET_KEY = "cos-secret-key";
const PLATFORM_EMPLOYEE_ID = "platform-employee-1";
const PLATFORM_EMPLOYEE_HASH = createHash("sha256")
  .update(PLATFORM_EMPLOYEE_ID)
  .digest("hex");
const SUPPLIER_LICENSE_OBJECT_KEY =
  `private/supplier-business-license/employees/${PLATFORM_EMPLOYEE_HASH}/`
  + "2026/07/24/license.jpg";

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

function supplierLicenseIntent(input: {
  objectKey?: string;
  employeeId?: string;
  mimeType?: string;
  sizeBytes?: number;
  expiresAtSeconds?: number;
} = {}) {
  return createSupplierLicenseUploadIntent({
    secretKey: SECRET_KEY,
    scene: "supplier_business_license",
    employeeId: input.employeeId ?? PLATFORM_EMPLOYEE_ID,
    objectKey: input.objectKey ?? SUPPLIER_LICENSE_OBJECT_KEY,
    mimeType: input.mimeType ?? "image/jpeg",
    sizeBytes: input.sizeBytes ?? 100,
    expiresAtSeconds: input.expiresAtSeconds ?? Math.floor(Date.now() / 1000) + 600,
  });
}

function supplierLicenseInput(overrides: Record<string, unknown> = {}) {
  const input: Record<string, unknown> = {
    scene: "supplier_business_license",
    objectKey: SUPPLIER_LICENSE_OBJECT_KEY,
    filename: "license.jpg",
    mimetype: "image/jpeg",
    sizeBytes: 100,
    visibility: "private",
    tenantId: null,
    employeeId: PLATFORM_EMPLOYEE_ID,
    verifyHead: true,
    ...overrides,
  };
  if (!("uploadIntent" in overrides)) {
    input.uploadIntent = supplierLicenseIntent({
      objectKey: String(input.objectKey),
      employeeId: String(input.employeeId),
      mimeType: String(input.mimetype),
      sizeBytes: Number(input.sizeBytes),
    });
  }
  return input;
}

function storageContext() {
  const headObject = mock(async () => ({
    headers: {
      "content-length": "100",
      "content-type": "image/jpeg; charset=binary",
    },
    ETag: '"head-etag"',
  }));
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

async function expectSupplierLicenseUploadRejected(input: Record<string, unknown>) {
  const { registerExistingCosObject } = await import("./direct-upload");
  const { context } = storageContext();
  await expect(registerExistingCosObject.call(context, input as never))
    .rejects.toMatchObject({
      statusCode: 400,
      code: "FILE_STORAGE_UPLOAD_FAILED",
    });
  expect(createOrFindByObjectKey).not.toHaveBeenCalled();
}

describe("supplier license direct upload", () => {
  test("binds supplier license uploads to employee prefix size type and intent", async () => {
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
      buildCosObjectKey: () => SUPPLIER_LICENSE_OBJECT_KEY,
      getCosClient: () => ({ getObjectUrl }),
      setCosAccessCache: () => undefined,
    }, {
      filename: "license.jpg",
      mimetype: "image/jpeg",
      sizeBytes: 100,
      scene: "supplier_business_license",
      tenantId: null,
      employeeId: PLATFORM_EMPLOYEE_ID,
      visibility: "private",
    });

    expect(getObjectUrl).toHaveBeenCalledWith(expect.objectContaining({
      Headers: {
        "Content-Length": 100,
        "Content-Type": "image/jpeg",
        "x-cos-forbid-overwrite": true,
      },
    }));
    expect(response.object_key).toBe(SUPPLIER_LICENSE_OBJECT_KEY);
    expect(response.upload_intent).toBeString();
  });

  test("keeps supplier license files private and owned by the creating employee", async () => {
    const { registerExistingCosObject } = await import("./direct-upload");
    const { context, headObject } = storageContext();
    const response = await registerExistingCosObject.call(
      context,
      supplierLicenseInput({ etag: '"head-etag"' }) as never,
    );

    expect(headObject).toHaveBeenCalledTimes(1);
    expect(createOrFindByObjectKey).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_type: "supplier_business_license",
        owner_id: null,
        owner_visitor_id: null,
        tenant_id: null,
        created_by_employee_id: PLATFORM_EMPLOYEE_ID,
        visibility: "private",
        public_url: null,
        mime_type: "image/jpeg",
        size_bytes: 100,
      }),
    );
    expect(response).toEqual({ file_id: "file-1", status: "active" });
    expect(response).not.toHaveProperty("url");
  });

  test.each([
    ["missing", null],
    ["wrong employee", supplierLicenseIntent({ employeeId: "other-employee" })],
    ["wrong key", supplierLicenseIntent({
      objectKey: "private/supplier-business-license/employees/other/file.jpg",
    })],
    ["expired", supplierLicenseIntent({ expiresAtSeconds: 1 })],
  ])("rejects %s supplier license upload intent before file creation", async (
    _name,
    uploadIntent,
  ) => {
    await expectSupplierLicenseUploadRejected(
      supplierLicenseInput({ uploadIntent }),
    );
  });
});
