import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string): string {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("platform branding addon product admin contract", () => {
  test("loads the product only for authorized platform administrators", () => {
    const page = readSource(
      "../../app/(console)/platform/branding-addon/page.tsx",
    );

    expect(page).toContain("isPlatformOnlySession");
    expect(page).toContain("platform.branding_product.manage");
    expect(page).toContain("/platform/branding/entitlement-product");
    expect(page).toContain("getAdminToken");
    expect(page).toContain("parseBackendJson");
    expect(page).toContain("PlatformBrandingVirtualProductForm");
    expect(page).toContain("paymentSummaries");
    expect(page).not.toContain("initialVirtualProducts");
  });

  test("keeps the product card filling the fixed admin workspace", () => {
    const page = readSource("../../app/(console)/platform/branding-addon/page.tsx");
    const form = readSource("./platform-branding-virtual-product-form.tsx");
    const loading = readSource("../../app/(console)/platform/branding-addon/loading.tsx");

    for (const source of [page, loading]) {
      expect(source).toContain("h-[calc(100vh-6.5625rem)]");
      expect(source).toContain("min-h-0 flex-col gap-5 overflow-hidden");
      expect(source).not.toContain("max-w-5xl");
    }
    expect(form).toContain('className="flex min-h-0 flex-1 flex-col"');
    expect(form).toContain('Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none"');
    expect(form).toContain('CardContent className="min-h-0 flex-1 overflow-auto p-5"');
    expect(loading).toContain('Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none"');
    expect(loading).toContain('CardContent className="min-h-0 flex-1 overflow-auto p-5"');
  });

  test("patches only product fields with optimistic version handling", () => {
    const form = readSource("./platform-branding-virtual-product-form.tsx");
    const fields = readSource("./platform-branding-addon-product-form.tsx");
    const retiredData = readSource(
      "./platform-branding-virtual-product-form-data.ts",
    );

    expect(form).toContain("requestBackendJson");
    expect(form).toContain('method: "PATCH"');
    expect(form).toContain("buildProductPatch");
    expect(form).toContain("BRANDING_ADDON_PRODUCT_VERSION_CONFLICT");
    expect(form).toContain("window.location.reload()");
    expect(form).toContain("JSON.stringify(payload)");
    expect(form).not.toContain("purchase_mode");
    expect(form).not.toContain("virtual_product");
    expect(form).not.toContain("/validate");
    expect(form).not.toContain("Legacy");
    expect(form).not.toContain("buildModePatch");
    expect(form).not.toContain("buildMappingPatch");
    expect(retiredData).not.toContain("Legacy");
    expect(retiredData).not.toContain("encrypted_secret_ref");
    expect(fields).toContain("FieldGroup");
    expect(fields).toContain("Switch");
    expect(form).toContain("历史订单继续使用创建时快照");
  });

  test("shows a read-only payment summary with the centralized settings deep link", () => {
    const form = readSource("./platform-branding-virtual-product-form.tsx");
    const summary = readSource("./platform-branding-payment-summary.tsx");

    expect(form).toContain("PlatformBrandingPaymentSummary");
    expect(summary).toContain("支付配置摘要");
    expect(summary).toContain("沙箱环境");
    expect(summary).toContain("生产环境");
    expect(summary).toContain("映射状态");
    expect(summary).toContain("校验状态");
    expect(summary).toContain("密钥状态");
    expect(summary).toContain("阻塞项");
    expect(summary).toContain(
      "/settings?group=payment&section=virtual&environment=production",
    );
    expect(summary).toContain("去支付配置");
    expect(summary).not.toContain("requestBackendJson");
    expect(summary).not.toContain("validate");
    expect(summary).not.toContain("Input");
  });

  test("uses accessible fields and exposes the immutable product facts", () => {
    const form = readSource("./platform-branding-addon-product-form.tsx");

    expect(form).toContain('htmlFor="branding-addon-product-name"');
    expect(form).toContain('htmlFor="branding-addon-product-amount"');
    expect(form).toContain('htmlFor="branding-addon-product-notes"');
    expect(form).toContain('id="branding-addon-product-enabled"');
    expect(form).toContain("product.code");
    expect(form).toContain("product.entitlement_code");
    expect(form).toContain("product.term_years");
  });

  test("associates validation feedback with fields and clears stale success", () => {
    const form = readSource("./platform-branding-addon-product-form.tsx");
    const shell = readSource("./platform-branding-virtual-product-form.tsx");

    expect(shell).toContain("ProductFormValidationError");
    expect(form).toContain("FieldError");
    expect(form).toContain(
      "data-invalid={Boolean(fieldErrors.name)}",
    );
    expect(form).toContain(
      "aria-invalid={Boolean(fieldErrors.amountYuan)}",
    );
    expect(form).toContain(
      "data-invalid={Boolean(fieldErrors.purchaseNotes)}",
    );
    expect(form).toContain("required={values.enabled}");
    expect(shell).toContain("function editProduct");
    expect(shell).toContain('setSaved("")');
  });
});
