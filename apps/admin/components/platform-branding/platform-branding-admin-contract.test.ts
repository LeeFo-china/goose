import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string): string {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("platform branding admin contract", () => {
  test("loads the platform brand only for authorized platform administrators", () => {
    const page = readSource("../../app/(console)/platform/branding/page.tsx");

    expect(page).toContain("isPlatformOnlySession");
    expect(page).toContain("platform.branding.manage");
    expect(page).toContain('buildBackendUrl("/platform/branding")');
    expect(page).toContain("getAdminToken");
    expect(page).toContain("parseBackendJson");
    expect(page).toContain("PlatformBrandingForm");
  });

  test("keeps the platform brand as a separate workspace from the addon product", () => {
    const page = readSource("../../app/(console)/platform/branding/page.tsx");
    const form = readSource("./platform-branding-form.tsx");

    expect(page).toContain("平台品牌");
    expect(page).toContain("租户未启用自定义品牌");
    expect(page).not.toContain("entitlement-product");
    expect(form).not.toContain("年度价格");
    expect(form).not.toContain("购买说明");
  });

  test("uploads a trusted brand logo and exposes accessible field feedback", () => {
    const form = readSource("./platform-branding-form.tsx");

    expect(form).toContain("uploadDirectToCos");
    expect(form).toContain('scene: "brand_logo"');
    expect(form).toContain("validateUploadFile");
    expect(form).toContain('accept="image/jpeg,image/png"');
    expect(form).toContain('type="file"');
    expect(form).toContain('htmlFor="platform-branding-display-name"');
    expect(form).toContain('aria-invalid={Boolean(fieldErrors.displayName)}');
    expect(form).toContain("PlatformBrandingFormValidationError");
    expect(form).toContain("uploaded.fileId");
  });

  test("saves a draft and publishes the saved version without hiding conflicts", () => {
    const form = readSource("./platform-branding-form.tsx");

    expect(form).toContain('"/platform/branding"');
    expect(form).toContain('method: "PATCH"');
    expect(form).toContain('"/platform/branding/publish"');
    expect(form).toContain('method: "POST"');
    expect(form).toContain("BRANDING_PROFILE_VERSION_CONFLICT");
    expect(form).toContain("router.refresh()");
    expect(form).toContain("canPublishPlatformBranding");
    expect(form).toContain("Spinner");
    expect(form).toContain("StatusAlert");
  });

  test("distinguishes editing preview from the currently published brand", () => {
    const form = readSource("./platform-branding-form.tsx");
    const preview = readSource("./platform-branding-preview.tsx");

    expect(form).toContain("URL.createObjectURL");
    expect(form).toContain("URL.revokeObjectURL");
    expect(form).toContain("PlatformBrandingPreview");
    expect(preview).toContain("编辑预览");
    expect(preview).toContain("当前线上品牌");
    expect(preview).toContain("support_text");
  });

  test("matches the loading skeleton to the real platform brand workspace", () => {
    const page = readSource("../../app/(console)/platform/branding/page.tsx");
    const form = readSource("./platform-branding-form.tsx");
    const loading = readSource(
      "../../app/(console)/platform/branding/loading.tsx",
    );

    for (const source of [page, loading]) {
      expect(source).toContain("h-[calc(100vh-6.5625rem)]");
      expect(source).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    }
    expect(form).toContain(
      'Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none"',
    );
    expect(loading).toContain(
      'Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none"',
    );
    expect(loading).toContain("CardFooter");
    expect(loading).toContain("Skeleton");
  });
});
