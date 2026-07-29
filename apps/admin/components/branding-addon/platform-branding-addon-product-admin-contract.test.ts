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
    expect(page).toContain("PlatformBrandingAddonProductForm");
    expect(page).toContain("key={result.product.version}");
  });

  test("patches editable fields with optimistic version handling", () => {
    const form = readSource(
      "./platform-branding-addon-product-form.tsx",
    );

    expect(form).toContain("requestBackendJson");
    expect(form).toContain('method: "PATCH"');
    expect(form).toContain("buildProductPatch");
    expect(form).toContain("BRANDING_ADDON_PRODUCT_VERSION_CONFLICT");
    expect(form).toContain("router.refresh()");
    expect(form).toContain("FieldGroup");
    expect(form).toContain("Switch");
    expect(form).toContain("历史订单保留创建时的商品快照");
  });

  test("uses accessible fields and exposes the immutable product facts", () => {
    const form = readSource(
      "./platform-branding-addon-product-form.tsx",
    );

    expect(form).toContain('htmlFor="branding-addon-product-name"');
    expect(form).toContain('htmlFor="branding-addon-product-amount"');
    expect(form).toContain('htmlFor="branding-addon-product-notes"');
    expect(form).toContain('id="branding-addon-product-enabled"');
    expect(form).toContain("product.code");
    expect(form).toContain("product.entitlement_code");
    expect(form).toContain("product.term_years");
  });
});
