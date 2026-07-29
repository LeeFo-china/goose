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
