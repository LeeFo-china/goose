import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("platform payment settings panel", () => {
  test("settings page fetches platform payment profiles for payment tab", () => {
    const pageSource = readFileSync(
      new URL("../../app/(console)/settings/page.tsx", import.meta.url),
      "utf8",
    );

    expect(pageSource).toContain("fetchPlatformPaymentProfiles");
    expect(pageSource).toContain("/platform/payment/wechat-pay/profiles");
    expect(pageSource).toContain("paymentProfiles=");
    expect(pageSource).toContain('payment: "支付配置"');
  });

  test("settings tabs render dedicated platform payment panel", () => {
    const tabsSource = readSource("./settings-tabs.tsx");

    expect(tabsSource).toContain("PlatformPaymentSettingsPanel");
    expect(tabsSource).toContain('activeGroup.code === "payment"');
    expect(tabsSource).toContain("paymentProfiles");
  });

  test("settings card constrains tab panels so payment tabs scroll instead of clipping", () => {
    const tabsSource = readSource("./settings-tabs.tsx");

    expect(tabsSource).toContain(
      'CardContent className="min-h-0 flex-1 overflow-hidden p-0"',
    );
    expect(tabsSource).toContain(
      'className="m-0 h-full min-h-0 overflow-auto data-[state=inactive]:hidden"',
    );
  });

  test("payment panel uses shadcn form controls and certificate upload interactions", () => {
    const panelSource = [
      readSource("./platform-payment-settings-panel.tsx"),
      readSource("./platform-payment-settings-shared.tsx"),
      readSource("./platform-payment-secret-form.tsx"),
    ].join("\n");

    expect(panelSource).toContain("FieldGroup");
    expect(panelSource).toContain("FieldLabel");
    expect(panelSource).toContain("SelectTrigger");
    expect(panelSource).toContain("Textarea");
    expect(panelSource).toContain('type="file"');
    expect(panelSource).toContain("platform_direct_recharge");
    expect(panelSource).toContain("tenant_service_provider");
    expect(panelSource).toContain("/platform/payment/wechat-pay/profiles/");
    expect(panelSource).toContain("/secret-bundle");
    expect(panelSource).toContain("readFileAsText");
    expect(panelSource).not.toContain("<input");
  });
});
