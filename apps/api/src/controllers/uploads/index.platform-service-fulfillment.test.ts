import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test } from "bun:test";

import {
  allowPlatformServiceWorkOrderUpload,
  buildPlatformRequest,
  buildRequest,
  completeDirectUpload,
  createDirectUpload,
  denyPlatformUploadPermission,
  platformEmployeeId,
  resetUploadControllerMocks,
} from "./index.test-harness";

const uploadBody = {
  scene: "tenant_service_fulfillment_attachment",
  filename: "deployment.pdf",
  mimetype: "application/pdf",
  size_bytes: 1024,
};

beforeEach(resetUploadControllerMocks);

describe("UploadController platform service fulfillment attachment direct upload", () => {
  test("initializes a private upload for a platform service work order manager", async () => {
    allowPlatformServiceWorkOrderUpload();
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(
      buildPlatformRequest(uploadBody),
      {} as never,
    );

    expect(createDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "tenant_service_fulfillment_attachment",
      tenantId: null,
      employeeId: platformEmployeeId,
      visibility: "private",
    }));
  });

  test("rejects tenant employees before upload initialization", async () => {
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildRequest(uploadBody),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });

  test("rejects platform staff without work-order permission", async () => {
    denyPlatformUploadPermission();
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildPlatformRequest(uploadBody),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });

  test("requires an upload intent before completing a private attachment", async () => {
    allowPlatformServiceWorkOrderUpload();
    const ownerHash = createHash("sha256").update(platformEmployeeId).digest("hex");
    const objectKey =
      `private/tenant-service-fulfillment-attachments/platform-employees/${ownerHash}/file.pdf`;
    const { default: controller } = await import("./index");

    await expect(controller.completeDirectCosUpload(
      buildPlatformRequest({
        ...uploadBody,
        object_key: objectKey,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });

  test("completes only the current platform employee private attachment object", async () => {
    allowPlatformServiceWorkOrderUpload();
    const ownerHash = createHash("sha256").update(platformEmployeeId).digest("hex");
    const objectKey =
      `private/tenant-service-fulfillment-attachments/platform-employees/${ownerHash}/2026/08/05/file.pdf`;
    completeDirectUpload.mockImplementationOnce(async () => ({
      file_id: "00000000-0000-4000-8000-000000000005",
      status: "active",
    }));
    const { default: controller } = await import("./index");

    const response = await controller.completeDirectCosUpload(
      buildPlatformRequest({
        ...uploadBody,
        object_key: objectKey,
        upload_intent: "v1.platform-service-fulfillment-upload-intent.signature",
      }),
      {} as never,
    );

    expect(completeDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "tenant_service_fulfillment_attachment",
      tenantId: null,
      employeeId: platformEmployeeId,
      objectKey,
      visibility: "private",
      uploadIntent: "v1.platform-service-fulfillment-upload-intent.signature",
    }));
    expect(response.data).toEqual({
      file_id: "00000000-0000-4000-8000-000000000005",
      status: "active",
    });
  });

  test("rejects another platform employee object key before storage completion", async () => {
    allowPlatformServiceWorkOrderUpload();
    const otherHash = createHash("sha256").update("other-platform-employee").digest("hex");
    const objectKey =
      `private/tenant-service-fulfillment-attachments/platform-employees/${otherHash}/2026/08/05/file.pdf`;
    const { default: controller } = await import("./index");

    await expect(controller.completeDirectCosUpload(
      buildPlatformRequest({
        ...uploadBody,
        object_key: objectKey,
        upload_intent: "v1.platform-service-fulfillment-upload-intent.signature",
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });
});
