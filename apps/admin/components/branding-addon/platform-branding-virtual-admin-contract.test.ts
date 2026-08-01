import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string): string {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("platform branding virtual-payment admin contract", () => {
  test("loads only the active authorized workspace", () => {
    const page = readSource(
      "../../app/(console)/platform/branding-addon/page.tsx",
    );

    expect(page).toContain("platform.branding_product.manage");
    expect(page).toContain("platform.branding_order.read");
    expect(page).toContain("platform.branding_virtual_refund.manage");
    expect(page).toContain('view === "product"');
    expect(page).toContain('view === "orders"');
    expect(page).toContain('view === "refunds"');
    expect(page).toContain("PlatformBrandingVirtualProductForm");
    expect(page).toContain("PlatformBrandingEntitlementOrders");
    expect(page).toContain("PlatformBrandingVirtualRefunds");
  });

  test("navigates controlled tabs through the Next router", () => {
    const tabs = readSource("./platform-branding-admin-tabs.tsx");

    expect(tabs).toContain("useRouter");
    expect(tabs).toContain("onValueChange");
    expect(tabs).toContain("router.push");
    expect(tabs).not.toContain("asChild");
  });

  test("renders the payment channel and three independent order states", () => {
    const source = readSource(
      "./platform-branding-entitlement-orders.tsx",
    );

    expect(source).toContain("payment_channel");
    expect(source).toContain("payment_status");
    expect(source).toContain("fulfillment_status");
    expect(source).toContain("refund_status");
    expect(source).toContain("isOrderRefundable");
    expect(source).toContain("Apple 外部处理");
  });

  test("keeps secrets masked and excludes platform-specific pricing", () => {
    const source = readSource(
      "./platform-branding-virtual-product-form.tsx",
    );

    expect(source).toContain("secret.configured");
    expect(source).toContain("secret.revision");
    expect(source).not.toContain('id="app-key"');
    expect(source).not.toContain("requested_platform_price");
    expect(source).not.toContain("客户端平台加价");
  });

  test("keeps loading structure aligned with tabs and table rows", () => {
    const loading = readSource(
      "../../app/(console)/platform/branding-addon/loading.tsx",
    );

    expect(loading).toContain("platform-branding-loading-tabs");
    expect(loading).toContain("platform-branding-loading-configuration");
    expect(loading).toContain("platform-branding-loading-filters");
    expect(loading).toContain("Array.from({ length: 8 })");
    expect(loading).toContain("min-h-0 flex-1");
  });
});
