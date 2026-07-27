import { describe, expect, test } from "bun:test";

import type { BrandingPlatformFileObjectRecord } from "@/repositories/platform-file-objects";

import {
  assertValidBrandLogoFile,
  BRAND_LOGO_POLICY,
} from "./branding-file-policy";

const platformFile: BrandingPlatformFileObjectRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: null,
  owner_type: "platform",
  owner_id: null,
  scene: "brand_logo",
  provider: "tencent_cos",
  bucket: "public-assets",
  region: "ap-shanghai",
  object_key: "public/brand-logo/logo.png",
  mime_type: "image/png",
  size_bytes: 1024,
  width: 256,
  height: 256,
  checksum: "etag",
  visibility: "public",
  public_url: "https://cdn.example.com/logo.png",
  status: "active",
  deleted_at: null,
};

function expectInvalid(
  file: BrandingPlatformFileObjectRecord,
  tenantId: string | null = null,
) {
  let caught: unknown;
  try {
    assertValidBrandLogoFile({ tenantId }, file);
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({
    statusCode: 400,
    code: "BRANDING_LOGO_FILE_INVALID",
  });
}

describe("assertValidBrandLogoFile", () => {
  test("accepts a valid platform-owned file", () => {
    expect(assertValidBrandLogoFile({ tenantId: null }, platformFile))
      .toBe(platformFile);
  });

  test("accepts a valid file owned by the exact tenant", () => {
    const tenantFile = { ...platformFile, tenant_id: "tenant-1" };

    expect(assertValidBrandLogoFile({ tenantId: "tenant-1" }, tenantFile))
      .toBe(tenantFile);
  });

  test.each([
    ["missing file", null, "tenant-1"],
    ["different tenant", { ...platformFile, tenant_id: "tenant-2" }, "tenant-1"],
    ["tenant file in platform scope", { ...platformFile, tenant_id: "tenant-1" }, null],
    ["platform file in tenant scope", platformFile, "tenant-1"],
  ] as const)("%s is hidden as not found", (_name, file, tenantId) => {
    let caught: unknown;
    try {
      assertValidBrandLogoFile({ tenantId }, file);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 404,
      code: "BRANDING_LOGO_FILE_NOT_FOUND",
    });
  });

  test.each([
    ["scene", { scene: "project_attachment" }],
    ["status", { status: "failed" }],
    ["visibility", { visibility: "private" }],
    ["deleted timestamp", { deleted_at: "2026-07-27T00:00:00.000Z" }],
    ["MIME type", { mime_type: "IMAGE/PNG" }],
    ["zero size", { size_bytes: 0 }],
    ["negative size", { size_bytes: -1 }],
    ["oversize", { size_bytes: BRAND_LOGO_POLICY.maxSizeBytes + 1 }],
    ["non-integer size", { size_bytes: 1.5 }],
    ["non-finite size", { size_bytes: Number.NaN }],
    ["missing width", { width: null }],
    ["small width", { width: BRAND_LOGO_POLICY.minWidth - 1 }],
    ["fractional width", { width: 128.5 }],
    ["non-finite width", { width: Number.POSITIVE_INFINITY }],
    ["missing height", { height: null }],
    ["small height", { height: BRAND_LOGO_POLICY.minHeight - 1 }],
    ["fractional height", { height: 128.5 }],
    ["non-finite height", { height: Number.NaN }],
    ["narrow aspect ratio", { width: 128, height: 161 }],
    ["wide aspect ratio", { width: 161, height: 128 }],
  ])("rejects invalid %s", (_name, patch) => {
    expectInvalid({
      ...platformFile,
      ...patch,
    } as BrandingPlatformFileObjectRecord);
  });

  test.each(["image/jpeg", "image/png", "image/webp"] as const)(
    "accepts approved canonical MIME %s",
    (mimeType) => {
      expect(assertValidBrandLogoFile(
        { tenantId: null },
        { ...platformFile, mime_type: mimeType },
      )).toMatchObject({ mime_type: mimeType });
    },
  );

  test("accepts inclusive size, dimension, and aspect-ratio boundaries", () => {
    expect(assertValidBrandLogoFile(
      { tenantId: null },
      {
        ...platformFile,
        size_bytes: 1,
        width: 128,
        height: 160,
      },
    )).toMatchObject({ size_bytes: 1, width: 128, height: 160 });

    expect(assertValidBrandLogoFile(
      { tenantId: null },
      {
        ...platformFile,
        size_bytes: BRAND_LOGO_POLICY.maxSizeBytes,
        width: 160,
        height: 128,
      },
    )).toMatchObject({
      size_bytes: BRAND_LOGO_POLICY.maxSizeBytes,
      width: 160,
      height: 128,
    });
  });

  test("ownership masking runs before invalid content checks", () => {
    let caught: unknown;
    try {
      assertValidBrandLogoFile(
        { tenantId: "tenant-1" },
        {
          ...platformFile,
          tenant_id: "tenant-2",
          scene: "project_attachment",
        },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 404,
      code: "BRANDING_LOGO_FILE_NOT_FOUND",
    });
  });
});
