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

  test("readiness refetch clears cached status before starting the request", () => {
    const panelSource = readSource("./platform-payment-settings-panel.tsx");
    const refreshBody = panelSource.match(
      /const refreshReadiness = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[\]\);/,
    )?.[1] || "";

    expect(refreshBody).toContain("setReadiness(null)");
    expect(refreshBody.indexOf("setReadiness(null)")).toBeLessThan(
      refreshBody.indexOf("requestBackendJson"),
    );
  });

  test("config and secret saves share readiness invalidation and refetch", () => {
    const panelSource = readSource("./platform-payment-settings-panel.tsx");
    const secretSource = readSource("./platform-payment-secret-form.tsx");

    expect(panelSource).toContain("handleMutationComplete");
    expect(panelSource).toContain(
      "onMutationComplete={handleMutationComplete}",
    );
    expect(panelSource.match(/onMutationComplete=\{onMutationComplete\}/g))
      .toHaveLength(2);
    expect(panelSource).toContain("await onMutationComplete()");
    expect(secretSource).toContain("onMutationComplete: () => Promise<void>");
    expect(secretSource).toContain("await onMutationComplete()");
    expect(panelSource).toContain("router.refresh()");
    expect(secretSource).toContain("router.refresh()");
  });

  test("readiness requests are latest-wins and invalidated on unmount", () => {
    const panelSource = readSource("./platform-payment-settings-panel.tsx");

    expect(panelSource).toContain("useRef");
    expect(panelSource).toContain("createLatestRequestCoordinator");
    expect(panelSource).toContain("requestCoordinatorRef");
    expect(panelSource).toContain("coordinator.begin()");
    expect(panelSource).toContain("coordinator.isCurrent(requestToken)");
    expect(panelSource).toContain("coordinator.invalidate()");
    expect(panelSource).toMatch(
      /setReadiness\(null\)[\s\S]*requestBackendJson<PlatformWechatPayReadinessResult>/,
    );
  });

  test("latest request coordinator rejects stale and invalidated completions", async () => {
    const coordinatorSource = readOptionalSource(
      "./platform-payment-readiness-request-coordinator.ts",
    );
    expect(coordinatorSource).toContain("createLatestRequestCoordinator");
    if (!coordinatorSource) return;

    const { createLatestRequestCoordinator } = await import(
      "./platform-payment-readiness-request-coordinator"
    );
    const coordinator = createLatestRequestCoordinator();
    const committed: string[] = [];
    let resolveFirst = () => {};
    let resolveSecond = () => {};
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    async function commitWhenCurrent(promise: Promise<void>, value: string) {
      const token = coordinator.begin();
      await promise;
      if (coordinator.isCurrent(token)) committed.push(value);
    }

    const firstRun = commitWhenCurrent(first, "first");
    const secondRun = commitWhenCurrent(second, "second");
    resolveSecond();
    await secondRun;
    resolveFirst();
    await firstRun;
    expect(committed).toEqual(["second"]);

    const unmountedToken = coordinator.begin();
    coordinator.invalidate();
    expect(coordinator.isCurrent(unmountedToken)).toBeFalse();
  });

  test("validation request errors expose only allowlisted safe diagnostics", () => {
    const readinessSource = readSource(
      "./platform-payment-readiness-section.tsx",
    );

    expect(readinessSource).toContain("toSafeValidationRequestFeedback");
    expect(readinessSource).toContain("error instanceof Error");
    expect(readinessSource).toContain("requestError.code");
    expect(readinessSource).toContain("requestError.requestId");
    expect(readinessSource).toContain("VALIDATION_HTTP_ERROR_MESSAGES");
    expect(readinessSource).toContain("SAFE_REQUEST_ID_PATTERN");
    expect(readinessSource).toContain("VALIDATION_REQUEST_ERROR_MESSAGE");
    expect(readinessSource).not.toContain("safeErrorMessage");
    expect(readinessSource).not.toContain("error.message");
    for (const code of [
      "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
      "PLATFORM_PAYMENT_PROFILE_CHANGED",
      "PLATFORM_PAYMENT_PROFILE_NOT_FOUND",
      "WECHAT_PAY_PROFILE_VALIDATION_FAILED",
      "WECHAT_PAY_PROFILE_PROBE_TIMEOUT",
      "WECHAT_PAY_PROFILE_PROBE_TRANSPORT_FAILED",
      "WECHAT_PAY_PROFILE_PROBE_UNAVAILABLE",
      "WECHAT_PAY_RESPONSE_TIMESTAMP_INVALID",
      "WECHAT_PAY_RESPONSE_BODY_INVALID",
      "WECHAT_PAY_TRANSPORT_FAILED",
      "DB_ERROR",
      "FORBIDDEN",
    ]) {
      expect(readinessSource).toContain(code);
    }
    expect(readinessSource).toContain("catch (validationError)");
    expect(readinessSource).toContain(
      "setFeedback(toSafeValidationRequestFeedback(validationError))",
    );
    expect(readinessSource).not.toContain("validationError.payload");
    expect(readinessSource).not.toContain("validationError.details");
    expect(readinessSource).not.toContain("JSON.stringify(validationError)");
    expect(readinessSource).not.toContain("Object.values(validationError)");
    expect(readinessSource).not.toContain("Object.entries(validationError)");
  });

  test("validation error normalization rejects invalid and hidden fields", async () => {
    const readinessModule = await import(
      "./platform-payment-readiness-section"
    );
    const normalize = (readinessModule as unknown as {
      toSafeValidationRequestFeedback?: (error: unknown) => unknown;
    }).toSafeValidationRequestFeedback;

    expect(normalize).toBeFunction();
    const requestError = Object.assign(new Error("raw backend secret"), {
      code: "PLATFORM_PAYMENT_PROFILE_CHANGED",
      requestId: "request-id:123",
    });
    Object.defineProperties(requestError, {
      payload: { get: () => { throw new Error("payload accessed"); } },
      details: { get: () => { throw new Error("details accessed"); } },
    });
    expect(normalize?.(requestError)).toEqual({
      tone: "error",
      message: "支付配置已更新，请刷新后重新验证。",
      code: "PLATFORM_PAYMENT_PROFILE_CHANGED",
      requestId: "request-id:123",
    });

    expect(normalize?.(Object.assign(new Error("raw backend message"), {
      code: "UNKNOWN_BUT_VALID",
      requestId: "request-id:456",
    }))).toEqual({
      tone: "error",
      message: "微信支付配置验证请求失败，请稍后重试。",
      requestId: "request-id:456",
    });
    expect(normalize?.({
      message: "arbitrary object message",
      code: "ARBITRARY_OBJECT_CODE",
      requestId: "arbitrary-object-id",
    })).toEqual({
      tone: "error",
      message: "微信支付配置验证请求失败，请稍后重试。",
    });
  });

  test("pending-order validation error covers every current payment use", async () => {
    const readinessModule = await import(
      "./platform-payment-readiness-section"
    );
    const normalize = (readinessModule as unknown as {
      toSafeValidationRequestFeedback?: (error: unknown) => unknown;
    }).toSafeValidationRequestFeedback;

    expect(normalize?.(Object.assign(new Error("ignored backend message"), {
      code: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
    }))).toEqual({
      tone: "error",
      message: "存在使用当前支付配置的待处理订单，请处理后重试。",
      code: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
    });
  });

  test("validation feedback clears only for absent or unchecked config", async () => {
    const readinessModule = await import(
      "./platform-payment-readiness-section"
    );
    const shouldClear = (readinessModule as unknown as {
      shouldClearValidationFeedback?: (
        config: { validation_status: string } | null,
      ) => boolean;
    }).shouldClearValidationFeedback;

    expect(shouldClear).toBeFunction();
    if (!shouldClear) return;

    expect(shouldClear(null)).toBeTrue();
    expect(shouldClear({ validation_status: "unchecked" })).toBeTrue();
    expect(shouldClear({ validation_status: "valid" })).toBeFalse();
    expect(shouldClear({ validation_status: "invalid" })).toBeFalse();
  });

  test("readiness state announces loading and conditionally clears validation feedback", () => {
    const readinessSource = readSource(
      "./platform-payment-readiness-section.tsx",
    );

    expect(readinessSource).toContain("aria-busy={loading}");
    expect(readinessSource).toContain('role="status"');
    expect(readinessSource).toContain('aria-live="polite"');
    expect(readinessSource).toMatch(
      /if \(shouldClearValidationFeedback\(profile\.config\)\) \{\s*setFeedback\(null\);\s*\}/,
    );
    expect(readinessSource).toContain(
      "profile.config?.validation_status",
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
