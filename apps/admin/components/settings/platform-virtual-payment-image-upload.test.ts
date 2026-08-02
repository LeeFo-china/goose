import { describe, expect, test } from "bun:test";

import {
  VIRTUAL_GOODS_IMAGE_MAX_SIZE_BYTES,
  validateVirtualGoodsImageDimensions,
  validateVirtualGoodsImageFile,
} from "./platform-virtual-payment-image-upload";

describe("platform virtual-payment image upload", () => {
  test.each(["image/jpeg", "image/png"])(
    "accepts canonical %s files up to 2 MiB",
    (type) => {
      expect(validateVirtualGoodsImageFile({
        type,
        size: VIRTUAL_GOODS_IMAGE_MAX_SIZE_BYTES,
      })).toBeNull();
    },
  );

  test("rejects unsupported image types", () => {
    expect(validateVirtualGoodsImageFile({
      type: "image/webp",
      size: 100,
    })).toBe("仅支持 JPG、JPEG 或 PNG 图片。");
  });

  test("rejects empty and oversized files", () => {
    expect(validateVirtualGoodsImageFile({
      type: "image/png",
      size: 0,
    })).toBe("图片文件无效，请重新选择。");
    expect(validateVirtualGoodsImageFile({
      type: "image/png",
      size: VIRTUAL_GOODS_IMAGE_MAX_SIZE_BYTES + 1,
    })).toBe("图片不能超过 2 MB。");
  });

  test("requires exact 200 by 200 dimensions", () => {
    expect(validateVirtualGoodsImageDimensions({ width: 200, height: 200 }))
      .toBeNull();
    expect(validateVirtualGoodsImageDimensions({ width: 201, height: 200 }))
      .toBe("图片尺寸必须为 200×200 像素。");
    expect(validateVirtualGoodsImageDimensions({ width: 200, height: 199 }))
      .toBe("图片尺寸必须为 200×200 像素。");
  });
});
