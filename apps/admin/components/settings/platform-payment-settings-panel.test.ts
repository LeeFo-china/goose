import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function readOptionalSource(path: string) {
  const sourceUrl = new URL(path, import.meta.url);
  return existsSync(sourceUrl) ? readFileSync(sourceUrl, "utf8") : "";
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

  test("settings tabs use shadcn vertical navigation and header summary", () => {
    const tabsSource = readSource("./settings-tabs.tsx");

    expect(tabsSource).toContain("CardDescription");
    expect(tabsSource).toContain("groupStatusLabel");
    expect(tabsSource).toContain('orientation="vertical"');
    expect(tabsSource).toContain('aria-label="系统配置分组"');
    expect(tabsSource).toContain("lg:grid-cols-[15rem_minmax(0,1fr)]");
    expect(tabsSource).toContain("data-[state=active]:border-primary");
    expect(tabsSource).not.toContain(
      "min-w-max justify-start rounded-none border-0 border-b bg-transparent",
    );
  });

  test("settings sidebar scrolls vertically while payment tabs only scroll horizontally", () => {
    const settingsTabsSource = readSource("./settings-tabs.tsx");
    const paymentPanelSource = readSource("./platform-payment-settings-panel.tsx");

    expect(settingsTabsSource).toContain("lg:overflow-y-auto");
    expect(paymentPanelSource).toContain("overflow-x-auto overflow-y-hidden");
    expect(paymentPanelSource).not.toContain(
      'className="-mx-4 overflow-x-auto px-4"',
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
    expect(panelSource).toContain("SelectGroup");
    expect(panelSource).toContain("Textarea");
    expect(panelSource).toContain('type="file"');
    expect(panelSource).toContain("platform_direct_recharge");
    expect(panelSource).toContain("tenant_service_provider");
    expect(panelSource).toContain("/platform/payment/wechat-pay/profiles/");
    expect(panelSource).toContain("/secret-bundle");
    expect(panelSource).toContain("readFileAsText");
    expect(panelSource).not.toContain("<input");
  });

  test("payment settings types model safe readiness and validation responses", () => {
    const typesSource = readSource("./platform-payment-settings-types.ts");

    expect(typesSource).toContain("last_validation_error_code");
    expect(typesSource).toContain("last_validation_error_message");
    expect(typesSource).toContain("last_validation_request_id");
    expect(typesSource).toContain("has_secret_bundle_revision");
    expect(typesSource).toContain("PlatformWechatPayReadinessResult");
    expect(typesSource).toContain("PlatformWechatPayReadinessChecks");
    expect(typesSource).toContain("merchant_mode_matches");
    expect(typesSource).toContain("required_channels_enabled");
    expect(typesSource).toContain("PlatformWechatPayValidationSuccess");
    expect(typesSource).toContain("PlatformWechatPayValidationFailure");
    expect(typesSource).toContain("ok: true");
    expect(typesSource).toContain("ok: false");
    expect(typesSource).not.toMatch(/^\s+encrypted_config_ref:/m);
    expect(typesSource).not.toMatch(/^\s+secret_bundle_revision:/m);
  });

  test("payment panel loads readiness and validates each configured profile", () => {
    const readinessSource = [
      readSource("./platform-payment-settings-panel.tsx"),
      readOptionalSource("./platform-payment-readiness-section.tsx"),
    ].join("\n");

    expect(readinessSource).toContain(
      'requestBackendJson<PlatformWechatPayReadinessResult>',
    );
    expect(readinessSource).toContain("/platform/payment/wechat-pay/readiness");
    expect(readinessSource).toContain("/validate");
    expect(readinessSource).toContain('method: "POST"');
    expect(readinessSource).toContain("验证支付配置");
    expect(readinessSource).toContain("正在验证配置");
    expect(readinessSource).toContain("router.refresh()");
    expect(readinessSource).toContain("refreshReadiness");
    expect(readinessSource).toContain(
      "disabled={readonly || !profile.configured || pending}",
    );
  });

  test("payment readiness renders blockers and safe validation evidence", () => {
    const readinessSource = readOptionalSource(
      "./platform-payment-readiness-section.tsx",
    );

    expect(readinessSource).toContain("已就绪");
    expect(readinessSource).toContain("未就绪");
    expect(readinessSource).toContain("blocker.message");
    expect(readinessSource).toContain("blocker.code");
    expect(readinessSource).toContain("last_validated_at");
    expect(readinessSource).toContain("last_validation_error_message");
    expect(readinessSource).toContain("last_validation_error_code");
    expect(readinessSource).toContain("last_validation_request_id");
    expect(readinessSource).toContain("StatusAlert");
  });

  test("payment settings never render internal secret references", () => {
    const renderedSources = [
      readSource("./platform-payment-settings-panel.tsx"),
      readSource("./platform-payment-secret-form.tsx"),
      readOptionalSource("./platform-payment-readiness-section.tsx"),
    ].join("\n");

    expect(renderedSources).toContain("密钥已安全保存");
    expect(renderedSources).toContain("尚未上传");
    expect(renderedSources).not.toContain("config?.encrypted_config_ref");
    expect(renderedSources).not.toContain("config?.secret_bundle_revision");
    expect(renderedSources).not.toContain("当前密钥引用");
    expect(renderedSources).not.toContain('label="密钥引用"');
    expect(renderedSources).not.toContain("setting://${");
    expect(renderedSources).not.toContain("<input");
  });

  test("generic system setting editor uses shadcn field and grouped select composition", () => {
    const source = [
      readSource("./settings-actions.tsx"),
      readSource("./settings-file-access-policy-editor.tsx"),
    ].join("\n");

    expect(source).toContain("FieldLabel");
    expect(source).toContain("FieldDescription");
    expect(source).toContain("SelectGroup");
    expect(source).not.toContain("space-y-2");
  });
});
