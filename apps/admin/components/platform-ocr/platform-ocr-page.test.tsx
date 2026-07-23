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

  test("settings use a dedicated OCR public key editor and render the OCR tester", () => {
    const tabs = readSource("../settings/settings-tabs.tsx");
    const actions = readSource("../settings/settings-actions.tsx");

    expect(actions).toContain("TencentOcrEncryptionPublicKeyEditor");
    expect(actions).toContain(
      'setting.key === "TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM"',
    );
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

  test("public key editor supports safe upload, paste, save, and confirmed clearing", () => {
    const source = readSource("./platform-ocr-encryption-public-key-editor.tsx");

    expect(source).toContain('accept=".pem,.txt,text/plain,application/x-pem-file"');
    expect(source).toContain("<Textarea");
    expect(source).toContain("selectedFileName");
    expect(source).toContain("createLatestPublicKeyFileReader");
    expect(source).toContain("fileReading");
    expect(source).toContain("resetNativeFileInput();");
    expect(source).toContain("已安全配置");
    expect(source).toContain("updateSetting(setting.key, normalized.pem)");
    expect(source).toContain('setValue("")');
    expect(source).toContain("AlertDialog");
    expect(source).toContain("清除配置");
    expect(source).toContain("updateSetting(setting.key, null)");
    expect(source).not.toContain("setting.stored_value");
    expect(source).not.toContain("setting.effective_value");
  });

  test("audit page uses server pagination and safe list fields only", () => {
    const page = readSource("../../app/(console)/platform/ocr/page.tsx");
    const table = readSource("./platform-ocr-page.tsx");

    expect(page).toContain('query.set("page"');
    expect(page).toContain('query.set("pageSize"');
    expect(page).toContain("/platform/ocr/recognitions?");
    expect(page).toContain("pagination={result.pagination}");
    expect(page).not.toContain(".filter(");
    expect(table).not.toContain("result_summary");
    expect(table).not.toContain("result_ciphertext");
    expect(table).not.toContain("image_url");
    expect(table).not.toContain("signed_url");
    expect(table).not.toContain("file_object_id");
  });

  test("platform page exposes a server-paginated tenant rollout view", () => {
    const page = readSource("../../app/(console)/platform/ocr/page.tsx");
    const filters = readSource("./platform-ocr-tenant-policy-filters.tsx");

    expect(page).toContain('view?: string');
    expect(page).toContain('view === "tenants"');
    expect(page).toContain("/platform/ocr/tenant-policies?");
    expect(page).toContain("PlatformOcrTenantPolicyTable");
    expect(page).toContain("平台总开关关闭时，所有租户灰度策略均不生效");
    expect(page).not.toContain("list.filter(");
    expect(filters).toContain('query.set("view", "tenants")');
    expect(filters).toContain('query.set("pageSize"');
    expect(filters).toContain("keyword");
    expect(filters).toContain("enabled");
  });

  test("tenant rollout editor composes existing shadcn controls", () => {
    const table = readSource("./platform-ocr-tenant-policy-table.tsx");
    const dialog = readSource("./platform-ocr-tenant-policy-dialog.tsx");

    expect(table).toContain("PlatformOcrTenantPolicyDialog");
    expect(table).toContain("DataTable");
    expect(dialog).toContain('from "@/components/ui/dialog"');
    expect(dialog).toContain('from "@/components/ui/field"');
    expect(dialog).toContain('from "@/components/ui/switch"');
    expect(dialog).toContain('from "@/components/ui/checkbox"');
    expect(dialog).toContain('from "@/components/ui/input"');
    expect(dialog).toContain('from "@/components/ui/textarea"');
    expect(dialog).toContain("/api/backend/platform/ocr/tenant-policies/");
    expect(dialog).toContain('method: "PUT"');
    expect(dialog).not.toContain("<select");
    expect(dialog).not.toContain("<input");
  });

  test("platform navigation exposes the OCR audit page", () => {
    const source = readSource("../layout/menu-config.ts");

    expect(source).toContain("ScanText");
    expect(source).toContain('href: "/platform/ocr"');
    expect(source).toContain('permission: "platform.ocr.recognition.read"');
  });
});
