import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  allowPlatformSupplierUpload,
  buildPlatformRequest,
  buildRequest,
  completeDirectUpload,
  createDirectUpload,
  denyPlatformEmployeeIdentity,
  denyPlatformSupplierPermission,
  platformEmployeeId,
  resetUploadControllerMocks,
} from "./index.test-harness";

beforeEach(resetUploadControllerMocks);

describe("UploadController supplier business license direct upload", () => {
  test("allows platform supplier manager to init a private supplier license upload", async () => {
    allowPlatformSupplierUpload();
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(
      buildPlatformRequest({
        scene: "supplier_business_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 5 * 1024 * 1024,
      }),
      {} as never,
    );

    expect(createDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "supplier_business_license",
      tenantId: null,
      employeeId: platformEmployeeId,
      visibility: "private",
    }));
  });

  test("rejects non-platform identities before supplier license upload init", async () => {
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildRequest({
        scene: "supplier_business_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });

  test("rejects platform users without supplier manage permission", async () => {
    denyPlatformSupplierPermission();
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildPlatformRequest({
        scene: "supplier_business_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });

  test("rejects platform supplier upload without an employee identity", async () => {
    denyPlatformEmployeeIdentity();
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildPlatformRequest({
        scene: "supplier_business_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });

  test.each([
    ["webp", "image/webp", 100],
    ["heic", "image/heic", 100],
    ["zero byte", "image/jpeg", 0],
    ["oversize", "image/jpeg", 5 * 1024 * 1024 + 1],
  ])("rejects supplier license init outside policy: %s", async (
    _name,
    mimetype,
    sizeBytes,
  ) => {
    allowPlatformSupplierUpload();
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildPlatformRequest({
        scene: "supplier_business_license",
        filename: "license.jpg",
        mimetype,
        size_bytes: sizeBytes,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 400 });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });

  test("completes only the current platform employee supplier license object", async () => {
    allowPlatformSupplierUpload();
    const ownerHash = createHash("sha256").update(platformEmployeeId).digest("hex");
    const objectKey =
      `private/supplier-business-license/employees/${ownerHash}/2026/07/24/file.jpg`;
    completeDirectUpload.mockImplementationOnce(async () => ({
      file_id: "00000000-0000-4000-8000-000000000004",
      status: "active",
    }));
    const { default: controller } = await import("./index");

    const response = await controller.completeDirectCosUpload(
      buildPlatformRequest({
        scene: "supplier_business_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
        object_key: objectKey,
        upload_intent: "v1.supplier-license-upload-intent.signature",
      }),
      {} as never,
    );

    expect(completeDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "supplier_business_license",
      tenantId: null,
      employeeId: platformEmployeeId,
      objectKey,
      visibility: "private",
      uploadIntent: "v1.supplier-license-upload-intent.signature",
    }));
    expect(response.data).toEqual({
      file_id: "00000000-0000-4000-8000-000000000004",
      status: "active",
    });
  });

  test("requires an upload intent to complete a supplier license", async () => {
    allowPlatformSupplierUpload();
    const ownerHash = createHash("sha256").update(platformEmployeeId).digest("hex");
    const objectKey = `private/supplier-business-license/employees/${ownerHash}/file.jpg`;
    const { default: controller } = await import("./index");

    await expect(controller.completeDirectCosUpload(
      buildPlatformRequest({
        scene: "supplier_business_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
        object_key: objectKey,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });
});
