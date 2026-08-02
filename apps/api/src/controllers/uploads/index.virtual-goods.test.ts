import { beforeEach, describe, expect, test } from "bun:test";

import {
  allowPlatformVirtualGoodsUpload,
  buildPlatformRequest,
  buildRequest,
  completeDirectUpload,
  createDirectUpload,
  platformEmployeeId,
  resetUploadControllerMocks,
} from "./index.test-harness";

const uploadBody = {
  scene: "branding_virtual_goods",
  filename: "goods.png",
  mimetype: "image/png",
  size_bytes: 1024,
};
const objectKey =
  "public/branding-virtual-goods/2026/08/02/11111111-1111-4111-8111-111111111111.png";

beforeEach(resetUploadControllerMocks);

describe("UploadController virtual goods image direct upload", () => {
  test("initializes a public upload for a platform payment administrator", async () => {
    allowPlatformVirtualGoodsUpload();
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(
      buildPlatformRequest(uploadBody),
      {} as never,
    );

    expect(createDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "branding_virtual_goods",
      tenantId: null,
      employeeId: platformEmployeeId,
      visibility: "public",
    }));
  });

  test("requires an upload intent before completing the upload", async () => {
    allowPlatformVirtualGoodsUpload();
    const { default: controller } = await import("./index");

    await expect(controller.completeDirectCosUpload(
      buildPlatformRequest({ ...uploadBody, object_key: objectKey }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });

  test("completes only under the public dedicated scene prefix", async () => {
    allowPlatformVirtualGoodsUpload();
    const { default: controller } = await import("./index");

    await controller.completeDirectCosUpload(
      buildPlatformRequest({
        ...uploadBody,
        object_key: objectKey,
        upload_intent: "v1.virtual-goods-intent.signature",
      }),
      {} as never,
    );

    expect(completeDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "branding_virtual_goods",
      objectKey,
      tenantId: null,
      employeeId: platformEmployeeId,
      visibility: "public",
    }));
  });

  test("rejects tenant employees", async () => {
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildRequest(uploadBody),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });
});
