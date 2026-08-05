import { describe, expect, test } from "bun:test";

import { assertDirectUploadFileDeclaration } from "./direct-upload-file-policy";

describe("brand_logo direct upload declaration", () => {
  test.each(["image/jpeg", "image/png", "image/webp"])(
    "accepts canonical %s up to 2 MiB",
    (mimetype) => {
      expect(() => assertDirectUploadFileDeclaration({
        scene: "brand_logo",
        mimetype,
        sizeBytes: 2 * 1024 * 1024,
      })).not.toThrow();
    },
  );

  test.each([
    ["HEIC", "image/heic", 100],
    ["HEIF", "image/heif", 100],
    ["uppercase", "IMAGE/PNG", 100],
    ["MIME parameters", "image/png; charset=binary", 100],
    ["zero size", "image/png", 0],
    ["negative size", "image/png", -1],
    ["fractional size", "image/png", 1.5],
    ["oversize", "image/png", 2 * 1024 * 1024 + 1],
  ])("rejects invalid %s with the branding error code", (
    _name,
    mimetype,
    sizeBytes,
  ) => {
    expect(() => assertDirectUploadFileDeclaration({
      scene: "brand_logo",
      mimetype,
      sizeBytes,
    })).toThrow(expect.objectContaining({
      statusCode: 400,
      code: "BRANDING_LOGO_FILE_INVALID",
    }));
  });
});

describe("branding_virtual_goods direct upload declaration", () => {
  test.each(["image/jpeg", "image/png"])(
    "accepts canonical %s up to 2 MiB",
    (mimetype) => {
      expect(() => assertDirectUploadFileDeclaration({
        scene: "branding_virtual_goods",
        mimetype,
        sizeBytes: 2 * 1024 * 1024,
      })).not.toThrow();
    },
  );

  test.each([
    ["WebP", "image/webp", 100],
    ["uppercase", "IMAGE/PNG", 100],
    ["MIME parameters", "image/png; charset=binary", 100],
    ["zero size", "image/png", 0],
    ["negative size", "image/png", -1],
    ["fractional size", "image/png", 1.5],
    ["oversize", "image/png", 2 * 1024 * 1024 + 1],
  ])("rejects invalid %s as a bad request", (
    _name,
    mimetype,
    sizeBytes,
  ) => {
    expect(() => assertDirectUploadFileDeclaration({
      scene: "branding_virtual_goods",
      mimetype,
      sizeBytes,
    })).toThrow(expect.objectContaining({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    }));
  });
});

describe("tenant_service_fulfillment_attachment direct upload declaration", () => {
  test.each(["image/jpeg", "image/png", "image/webp", "application/pdf"])(
    "accepts canonical %s up to 10 MiB",
    (mimetype) => {
      expect(() => assertDirectUploadFileDeclaration({
        scene: "tenant_service_fulfillment_attachment",
        mimetype,
        sizeBytes: 10 * 1024 * 1024,
      })).not.toThrow();
    },
  );

  test.each([
    ["HEIC", "image/heic", 100],
    ["plain text", "text/plain", 100],
    ["uppercase", "APPLICATION/PDF", 100],
    ["MIME parameters", "application/pdf; charset=binary", 100],
    ["zero size", "application/pdf", 0],
    ["negative size", "application/pdf", -1],
    ["fractional size", "application/pdf", 1.5],
    ["oversize", "application/pdf", 10 * 1024 * 1024 + 1],
  ])("rejects invalid %s as a bad request", (
    _name,
    mimetype,
    sizeBytes,
  ) => {
    expect(() => assertDirectUploadFileDeclaration({
      scene: "tenant_service_fulfillment_attachment",
      mimetype,
      sizeBytes,
    })).toThrow(expect.objectContaining({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    }));
  });
});
