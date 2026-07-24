import { describe, expect, test } from "bun:test";
import {
  createApplymentUploadIntent,
  verifyApplymentUploadIntent,
} from "./applyment-upload-intent";

const BASE_INPUT = {
  secretKey: "cos-secret-key",
  scene: "wechat_pay_applyment",
  tenantId: "tenant-1",
  objectKey: "tenants/tenant-1/wechat-pay-applyment/license.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 100,
};

describe("wechat pay applyment upload intent", () => {
  test.each([
    ["tenant", { tenantId: "tenant-2" }],
    [
      "object key",
      { objectKey: "tenants/tenant-1/wechat-pay-applyment/other.jpg" },
    ],
    ["size", { sizeBytes: 99 }],
    ["MIME", { mimeType: "image/png" }],
  ])("rejects a completion whose %s differs from init", (
    _name,
    overrides,
  ) => {
    const token = createApplymentUploadIntent({
      ...BASE_INPUT,
      expiresAtSeconds: 200,
    });

    expect(verifyApplymentUploadIntent({
      ...BASE_INPUT,
      ...overrides,
      token,
      nowSeconds: 100,
    })).toBe(false);
  });
});
