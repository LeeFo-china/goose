import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("platform OCR admin", () => {
  test("settings expose OCR after storage and location integrations", () => {
    const source = readSource("../../app/(console)/settings/page.tsx");

    expect(source).toContain('ocr: "腾讯云 OCR"');
    expect(source.indexOf('"location"')).toBeLessThan(source.indexOf('"ocr"'));
    expect(source.indexOf('"ocr"')).toBeLessThan(source.indexOf('"ai"'));
  });

  test("settings reuse masked secret editors and render the OCR tester", () => {
    const tabs = readSource("../settings/settings-tabs.tsx");
    const actions = readSource("../settings/settings-actions.tsx");

    expect(actions).toContain('type="password"');
    expect(tabs).toContain("PlatformOcrConfigTester");
    expect(tabs).toContain('activeGroup.code === "ocr"');
  });

  test("config test requires an authorized image and billable confirmation", () => {
    const source = readSource("./platform-ocr-config-tester.tsx");

    expect(source).toContain('accept="image/jpeg,image/png"');
    expect(source).toContain('type="file"');
    expect(source).toContain("selectedFile.name");
    expect(source).toContain("AlertDialog");
    expect(source).toContain("已获得该测试图片的使用授权");
    expect(source).toContain("本次调用可能产生腾讯云费用");
    expect(source).toContain("/platform/ocr/config-test");
    expect(source).toContain("FormData");
    expect(source).not.toContain("<input");
  });

  test("audit page uses server pagination and safe list fields only", () => {
    const page = readSource("../../app/(console)/platform/ocr/page.tsx");
    const table = readSource("./platform-ocr-page.tsx");

    expect(page).toContain('query.set("page"');
    expect(page).toContain('query.set("pageSize"');
    expect(page).toContain("/platform/ocr/recognitions?");
    expect(page).toContain("pagination={pagination}");
    expect(page).not.toContain(".filter(");
    expect(table).not.toContain("result_summary");
    expect(table).not.toContain("result_ciphertext");
    expect(table).not.toContain("image_url");
    expect(table).not.toContain("signed_url");
    expect(table).not.toContain("file_object_id");
  });

  test("platform navigation exposes the OCR audit page", () => {
    const source = readSource("../layout/menu-config.ts");

    expect(source).toContain("ScanText");
    expect(source).toContain('href: "/platform/ocr"');
    expect(source).toContain('permission: "platform.ocr.recognition.read"');
  });
});
