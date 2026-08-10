import { beforeEach, describe, expect, test } from "bun:test";

import {
  allowPlatformBrandLogoUpload,
  assertCanCustomize,
  buildPlatformRequest,
  buildRequest,
  completeDirectUpload,
  createDirectUpload,
  denyPlatformUploadPermission,
  employeeId,
  platformEmployeeId,
  resetUploadControllerMocks,
  tenantId,
} from "./index.test-harness";

const uploadBody = {
  scene: "brand_logo",
  filename: "logo.png",
  mimetype: "image/png",
  size_bytes: 1024,
};
const completeUploadBody = {
  ...uploadBody,
  upload_intent: "v1.brand-logo-intent.signature",
};
const LOGO_UUID = "11111111-1111-4111-8111-111111111111";

beforeEach(resetUploadControllerMocks);

describe("UploadController brand logo direct upload", () => {
  test("initializes a public tenant brand logo from the live employee context", async () => {
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(buildRequest(uploadBody), {} as never);

    expect(assertCanCustomize).toHaveBeenCalledTimes(1);
    expect(createDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "brand_logo",
      tenantId,
      employeeId,
      customerId: null,
      visitorId: null,
      visibility: "public",
    }));
  });

  test("initializes a public platform brand logo with platform permission", async () => {
    allowPlatformBrandLogoUpload();
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(
      buildPlatformRequest(uploadBody),
      {} as never,
    );

    expect(assertCanCustomize).not.toHaveBeenCalled();
    expect(createDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "brand_logo",
      tenantId: null,
      employeeId: platformEmployeeId,
      visibility: "public",
    }));
  });

  test("propagates an inactive entitlement before upload initialization", async () => {
    assertCanCustomize.mockImplementationOnce(async () => {
      throw Object.assign(new Error("suspended"), {
        statusCode: 403,
        code: "BRANDING_ENTITLEMENT_SUSPENDED",
      });
    });
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildRequest(uploadBody),
      {} as never,
    )).rejects.toMatchObject({
      statusCode: 403,
      code: "BRANDING_ENTITLEMENT_SUSPENDED",
    });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });

  test("rejects platform staff without branding permission", async () => {
    denyPlatformUploadPermission();
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildPlatformRequest(uploadBody),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });

  test("requires an upload intent when completing a brand logo", async () => {
    const objectKey =
      `tenants/${tenantId}/brand-logo/2026/07/27/${LOGO_UUID}.png`;
    const { default: controller } = await import("./index");

    await expect(controller.completeDirectCosUpload(
      buildRequest({ ...uploadBody, object_key: objectKey }),
      {} as never,
    )).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });

  test("completes a tenant logo only under the live tenant prefix", async () => {
    const objectKey =
      `tenants/${tenantId}/brand-logo/2026/07/27/${LOGO_UUID}.png`;
    const { default: controller } = await import("./index");

    await controller.completeDirectCosUpload(
      buildRequest({ ...completeUploadBody, object_key: objectKey }),
      {} as never,
    );

    expect(completeDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "brand_logo",
      objectKey,
      tenantId,
      employeeId,
      visibility: "public",
    }));
  });

  test("completes a platform logo only under the public brand prefix", async () => {
    allowPlatformBrandLogoUpload();
    const objectKey = `public/brand-logo/2026/07/27/${LOGO_UUID}.png`;
    const { default: controller } = await import("./index");

    await controller.completeDirectCosUpload(
      buildPlatformRequest({ ...completeUploadBody, object_key: objectKey }),
      {} as never,
    );

    expect(completeDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "brand_logo",
      objectKey,
      tenantId: null,
      employeeId: platformEmployeeId,
      visibility: "public",
    }));
  });

  test.each([
    [
      "tenant using platform path",
      () => buildRequest({
        ...completeUploadBody,
        object_key:
          `public/brand-logo/2026/07/27/${LOGO_UUID}.png`,
      }),
    ],
    [
      "platform using tenant path",
      () => {
        allowPlatformBrandLogoUpload();
        return buildPlatformRequest({
          ...completeUploadBody,
          object_key:
            `tenants/${tenantId}/brand-logo/2026/07/27/${LOGO_UUID}.png`,
        });
      },
    ],
    [
      "tenant using unassigned path",
      () => buildRequest({
        ...completeUploadBody,
        object_key:
          `tenants/${tenantId}/brand-logo/unassigned/2026/logo.png`,
      }),
    ],
  ])("rejects cross-scope completion: %s", async (_name, requestFactory) => {
    const { default: controller } = await import("./index");

    await expect(controller.completeDirectCosUpload(
      requestFactory(),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });

  test.each([
    ["PNG with JPG key", "image/png", `${LOGO_UUID}.jpg`],
    ["WebP with PNG key", "image/webp", `${LOGO_UUID}.png`],
    ["missing extension", "image/png", LOGO_UUID],
    ["double extension", "image/png", `${LOGO_UUID}.jpg.png`],
    ["uppercase extension", "image/png", `${LOGO_UUID}.PNG`],
  ])("rejects MIME/key mismatch before storage: %s", async (
    _name,
    mimetype,
    basename,
  ) => {
    const { default: controller } = await import("./index");

    await expect(controller.completeDirectCosUpload(
      buildRequest({
        ...completeUploadBody,
        mimetype,
        object_key:
          `tenants/${tenantId}/brand-logo/2026/07/27/${basename}`,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });
});
