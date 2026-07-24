import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  buildWechatPayApplymentAttachmentPreviewUrl,
  getWechatPayApplymentAttachmentDisplayName,
} from "./finance-wechat-pay-applyment-shared";

describe("wechat pay applyment attachment preview", () => {
  test("builds only a same-origin authenticated preview URL from file id", () => {
    expect(buildWechatPayApplymentAttachmentPreviewUrl({
      file_object_id: "11111111-1111-4111-8111-111111111111",
      object_key: "https://attacker.example/private.jpg",
    })).toBe(
      "/api/backend/uploads/files/11111111-1111-4111-8111-111111111111/preview",
    );
    expect(buildWechatPayApplymentAttachmentPreviewUrl({
      file_object_id: null,
      object_key: "https://attacker.example/private.jpg",
    })).toBe("");
    expect(buildWechatPayApplymentAttachmentPreviewUrl({
      file_object_id: null,
      object_key: "blob:https://admin.example/session-secret",
    })).toBe("");
  });

  test("never exposes object keys as a visible filename fallback", () => {
    expect(getWechatPayApplymentAttachmentDisplayName({
      category: "license_copy",
      object_key: "tenants/tenant-secret/wechat-pay-applyment/license.jpg",
    })).toBe("营业执照照片");
    expect(getWechatPayApplymentAttachmentDisplayName({
      category: "future_private_material",
      object_key: "https://cos.example/signed.jpg?secret=1",
    })).toBe("已上传资料");
  });

  test("provides lazy loading and a stable retryable failure state", () => {
    const source = readFileSync(
      new URL(
        "./finance-wechat-pay-applyment-attachment-preview.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).toContain('loading="lazy"');
    expect(source).toContain("onError");
    expect(source).toContain("预览加载失败");
    expect(source).toContain("重试预览");
    expect(source).not.toContain("attachment.object_key");
  });
});
