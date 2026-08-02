import { describe, expect, test } from "bun:test";

import {
  createVirtualGoodsUploadIntent,
  verifyVirtualGoodsUploadIntent,
} from "./virtual-goods-upload-intent";

const base = {
  secretKey: "cos-secret-key",
  scene: "branding_virtual_goods",
  tenantId: null,
  employeeId: "employee-1",
  objectKey:
    "public/branding-virtual-goods/2026/08/02/11111111-1111-4111-8111-111111111111.png",
  mimeType: "image/png",
  sizeBytes: 1024,
};

describe("virtual goods upload intent", () => {
  test("round-trips claims without exposing raw employee identity", () => {
    const token = createVirtualGoodsUploadIntent({
      ...base,
      expiresAtSeconds: 2_000,
    });

    expect(token).not.toContain(base.employeeId);
    expect(verifyVirtualGoodsUploadIntent({
      ...base,
      token,
      nowSeconds: 1_000,
    })).toMatchObject({
      scene: "branding_virtual_goods",
      objectKey: base.objectKey,
      mimeType: "image/png",
      sizeBytes: 1024,
      expiresAtSeconds: 2_000,
    });
  });

  test.each([
    ["scene", { scene: "brand_logo" }],
    ["tenant", { tenantId: "tenant-1" }],
    ["employee", { employeeId: "employee-2" }],
    ["object key", { objectKey: `${base.objectKey}.tampered` }],
    ["MIME", { mimeType: "image/jpeg" }],
    ["size", { sizeBytes: 1025 }],
  ])("rejects a changed %s", (_name, patch) => {
    const token = createVirtualGoodsUploadIntent({
      ...base,
      expiresAtSeconds: 2_000,
    });

    expect(verifyVirtualGoodsUploadIntent({
      ...base,
      ...patch,
      token,
      nowSeconds: 1_000,
    })).toBeNull();
  });

  test("rejects an expired intent", () => {
    const token = createVirtualGoodsUploadIntent({
      ...base,
      expiresAtSeconds: 2_000,
    });

    expect(verifyVirtualGoodsUploadIntent({
      ...base,
      token,
      nowSeconds: 2_000,
    })).toBeNull();
  });
});
