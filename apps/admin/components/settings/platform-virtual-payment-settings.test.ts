import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("platform virtual payment settings", () => {
  test("mutation success waits for the latest snapshot refresh", () => {
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");

    expect(virtualSource).toContain("async function refreshSnapshot(): Promise<boolean>");
    expect(virtualSource).toContain("return true;");
    expect(virtualSource).toContain("return false;");
    expect(virtualSource).toContain("ensureSnapshotRefreshed");
    expect(virtualSource).toContain(
      "已提交，但最新状态刷新失败，请重新加载。",
    );
    expect(virtualSource).toMatch(
      /await ensureSnapshotRefreshed\(\);\s*setNotice\(successMessage\)/,
    );
  });

  test("separates ordinary and virtual payment with URL deep links", () => {
    const panelSource = readSource("./platform-payment-settings-panel.tsx");

    expect(panelSource).toContain("useSearchParams");
    expect(panelSource).toContain('type PaymentSection = "ordinary" | "virtual"');
    expect(panelSource).toContain('searchParams.get("section") === "virtual"');
    expect(panelSource).toContain('searchParams.get("environment") === "production"');
    expect(panelSource).toContain('params.set("group", "payment")');
    expect(panelSource).toContain('params.set("section", section)');
    expect(panelSource).toContain('params.set("environment", environment)');
    expect(panelSource).toContain("普通微信支付");
    expect(panelSource).toContain("数字权益虚拟支付");
    expect(panelSource).toContain("PlatformVirtualPaymentSettings");
  });

  test("calls all five virtual payment configuration APIs", () => {
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");

    expect(virtualSource).toContain(
      '"/platform/payment/wechat-virtual/branding-entitlement"',
    );
    expect(virtualSource).toContain('method: "PATCH"');
    expect(virtualSource).toContain("/secret-bundle");
    expect(virtualSource).toContain(
      '"/platform/payment/wechat-virtual/message-token"',
    );
    expect(virtualSource).toContain("/validate");
    expect(virtualSource).toContain('method: "POST"');
    expect(virtualSource).toContain("refreshSnapshot");
  });

  test("uses safe shadcn composition and never refills secrets", () => {
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");
    const secretSource = readSource("./platform-virtual-payment-secret-form.tsx");
    const mappingSource = readSource("./platform-virtual-payment-mapping-card.tsx");
    const source = `${virtualSource}\n${secretSource}\n${mappingSource}`;

    expect(source).toContain("FieldGroup");
    expect(source).toContain("FieldLabel");
    expect(source).toContain("TabsList");
    expect(source).toContain("CardHeader");
    expect(source).toContain("CardContent");
    expect(source).toContain("CardFooter");
    expect(source).toContain("Spinner");
    expect(source).toContain("Skeleton");
    expect(secretSource).toContain('type="password"');
    expect(secretSource).not.toContain("defaultValue=");
    expect(secretSource).not.toMatch(/\bvalue=\{[^}]*token/i);
    expect(secretSource).not.toMatch(/\bvalue=\{[^}]*appKey/i);
    expect(source).not.toContain("space-y-");
  });

  test("remounts the secret form from the latest server revision", () => {
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");

    expect(virtualSource).toContain(
      "key={`${environment}:${summary.secret.revision ?? 0}:${snapshot.message_auth.message_token.valid}`}",
    );
  });

  test("skeleton mirrors the mapping and two secret columns", () => {
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");
    const skeletonBody = virtualSource.match(
      /function VirtualPaymentSettingsSkeleton\(\) \{([\s\S]*?)\n\}\n\nfunction VirtualPaymentCardSkeleton/,
    )?.[1] || "";

    expect(skeletonBody).toContain('["mode", "mapping"]');
    expect(skeletonBody).toContain('["secret", "message-token"]');
    expect(skeletonBody).toContain('className="grid gap-4 xl:grid-cols-2"');
  });

  test("exposes only allowlisted safe mutation errors", () => {
    const errorSource = readSource("./platform-virtual-payment-errors.ts");
    const renderedSources = [
      readSource("./platform-virtual-payment-settings.tsx"),
      readSource("./platform-virtual-payment-mapping-card.tsx"),
      readSource("./platform-virtual-payment-secret-form.tsx"),
    ].join("\n");

    expect(errorSource).toContain("SAFE_VIRTUAL_PAYMENT_ERROR_MESSAGES");
    expect(errorSource).toContain("BRANDING_VIRTUAL_PAYMENT_NOT_READY");
    expect(errorSource).toContain("WECHAT_VIRTUAL_PAYMENT_SECRET_REVISION_CONFLICT");
    expect(errorSource).toContain('caught.status === 403');
    expect(renderedSources).toContain("toSafeVirtualPaymentMutationMessage");
    expect(renderedSources).not.toContain("caught.message");
  });

  test("normalizes only bounded validation code and requestId", async () => {
    const {
      createVirtualPaymentUiError,
      toSafeVirtualPaymentMutationFeedback,
    } = await import(
      "./platform-virtual-payment-errors"
    );
    const fallback = "虚拟商品映射校验失败，请检查配置。";
    expect(toSafeVirtualPaymentMutationFeedback(
      Object.assign(new Error("raw upstream detail"), {
        status: 502,
        code: "BRANDING_VIRTUAL_PRODUCT_WECHAT_QUERY_UNCONFIRMED",
        requestId: "request-id:123",
      }),
      fallback,
    )).toEqual({
      message: "暂未确认微信虚拟商品状态，请稍后重试。",
      code: "BRANDING_VIRTUAL_PRODUCT_WECHAT_QUERY_UNCONFIRMED",
      requestId: "request-id:123",
    });
    expect(toSafeVirtualPaymentMutationFeedback(
      Object.assign(new Error("raw secret"), {
        status: 502,
        code: "UNKNOWN_REMOTE_CODE",
        requestId: "invalid request id with spaces",
      }),
      fallback,
    )).toEqual({ message: fallback });
    expect(toSafeVirtualPaymentMutationFeedback(
      new Error("raw network diagnostic"),
      fallback,
    )).toEqual({ message: fallback });
    expect(toSafeVirtualPaymentMutationFeedback(
      createVirtualPaymentUiError("请先保存当前映射"),
      fallback,
    )).toEqual({ message: "请先保存当前映射" });
  });

  test("shows the linked entitlement product and AppKey source", () => {
    const modeSource = readSource("./platform-virtual-payment-mode-card.tsx");
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");
    const secretSource = readSource("./platform-virtual-payment-secret-form.tsx");

    expect(modeSource).toContain("snapshot.product.name");
    expect(modeSource).toContain("统一售价");
    expect(modeSource).toContain('href="/platform/branding-addon"');
    expect(virtualSource).toContain(
      "secretSource={snapshot.virtual_secret_sources[environment]}",
    );
    expect(secretSource).toContain("secretSource");
    expect(secretSource).toContain("当前来源");
    expect(secretSource).toContain("sourceLabel(secretSource.source)");
    expect(secretSource).toContain(
      "const secretReady = secretSource.configured && summary.secret.configured",
    );
    expect(secretSource).toContain("配置无效，需更新");
  });

  test("shows validation time and refreshes a failed validation before retry", () => {
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");
    const mappingSource = readSource("./platform-virtual-payment-mapping-card.tsx");

    expect(mappingSource).toContain("mapping?.validated_at");
    expect(mappingSource).toContain("最近校验");
    expect(mappingSource).toContain("validationFeedback.requestId");
    expect(mappingSource).toContain("validationFeedback.code");
    expect(virtualSource).toContain("toSafeVirtualPaymentMutationFeedback");
    expect(virtualSource).toMatch(
      /catch \(validationError\) \{[\s\S]*await refreshSnapshot\(\)[\s\S]*setValidationFeedback/,
    );
    expect(virtualSource).toContain("校验未通过，且最新状态刷新失败");
  });

  test("confirms production activation and gates it with server readiness", () => {
    const modeSource = readSource("./platform-virtual-payment-mode-card.tsx");

    expect(modeSource).toContain("AlertDialog");
    expect(modeSource).toContain("启用生产虚拟支付");
    expect(modeSource).toContain("不会自动回退普通支付");
    expect(modeSource).toContain("snapshot.readiness.ready");
    expect(modeSource).toContain("snapshot.can_manage");
    expect(modeSource).toContain("modePending");
    expect(modeSource).toContain(
      "disabled={!snapshot.readiness.ready || !snapshot.can_manage || modePending}",
    );
    expect(modeSource).toContain('import Link from "next/link"');
  });
});
