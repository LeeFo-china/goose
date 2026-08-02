import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("platform virtual-payment image field", () => {
  test("uses the dedicated direct-upload scene and strict local file rules", () => {
    const source = readSource("./platform-virtual-payment-image-field.tsx");

    expect(source).toContain('accept=".jpg,.jpeg,.png,image/jpeg,image/png"');
    expect(source).toContain("validateVirtualGoodsImageForUpload");
    expect(source).toContain("uploadDirectToCos");
    expect(source).toContain('scene: "branding_virtual_goods"');
    expect(source).toContain("uploaded.publicUrl || uploaded.url");
    expect(source).toContain("URL.createObjectURL");
    expect(source).toContain("URL.revokeObjectURL");
  });

  test("keeps upload explicit and retains the advanced URL entry", () => {
    const source = readSource("./platform-virtual-payment-image-field.tsx");

    expect(source).toContain('type="button"');
    expect(source).toContain("选择图片");
    expect(source).toContain("更换图片");
    expect(source).toContain("或填写图片 URL（高级）");
    expect(source).toContain("onPendingChange(true)");
    expect(source).toContain("onPendingChange(false)");
    expect(source).not.toContain("onSave");
  });

  test("blocks mapping save during upload and mirrors the field in skeleton", () => {
    const mapping = readSource("./platform-virtual-payment-mapping-card.tsx");
    const settings = readSource("./platform-virtual-payment-settings.tsx");

    expect(mapping).toContain("VirtualPaymentImageField");
    expect(mapping).toContain("setImageUploading");
    expect(mapping).toContain("pendingAction || imageUploading");
    expect(settings).toContain("showImageUpload");
    expect(settings).toContain('className="size-20 rounded-md"');
  });
});
