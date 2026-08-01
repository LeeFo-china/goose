import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("platform virtual payment settings", () => {
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
