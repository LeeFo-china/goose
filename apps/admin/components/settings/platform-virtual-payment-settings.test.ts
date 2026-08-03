import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function readOptionalSource(path: string) {
  const sourceUrl = new URL(path, import.meta.url);
  return existsSync(sourceUrl) ? readFileSync(sourceUrl, "utf8") : "";
}

describe("platform virtual payment settings", () => {
  test("superseded refresh callers share the latest final result", async () => {
    const coordinatorSource = readOptionalSource(
      "./platform-virtual-payment-refresh-coordinator.ts",
    );
    expect(coordinatorSource).toContain("createLatestRefreshCoordinator");
    if (!coordinatorSource) return;

    const { createLatestRefreshCoordinator } = await import(
      "./platform-virtual-payment-refresh-coordinator"
    );
    const coordinator = createLatestRefreshCoordinator();
    const committed: string[] = [];
    const failed: string[] = [];
    let resolveFirst = (_value: string) => {};
    let resolveSecond = (_value: string) => {};
    const firstRequest = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const secondRequest = new Promise<string>((resolve) => {
      resolveSecond = resolve;
    });
    const firstRun = coordinator.run(
      () => firstRequest,
      {
        onSuccess: (value) => committed.push(value),
        onError: () => failed.push("first"),
      },
    );
    const secondRun = coordinator.run(
      () => secondRequest,
      {
        onSuccess: (value) => committed.push(value),
        onError: () => failed.push("second"),
      },
    );

    resolveFirst("stale");
    resolveSecond("latest");
    expect(await Promise.all([firstRun, secondRun])).toEqual([true, true]);
    expect(committed).toEqual(["latest"]);
    expect(failed).toEqual([]);
  });

  test("superseded refresh callers share a real latest failure", async () => {
    const coordinatorSource = readOptionalSource(
      "./platform-virtual-payment-refresh-coordinator.ts",
    );
    expect(coordinatorSource).toContain("createLatestRefreshCoordinator");
    if (!coordinatorSource) return;

    const { createLatestRefreshCoordinator } = await import(
      "./platform-virtual-payment-refresh-coordinator"
    );
    const coordinator = createLatestRefreshCoordinator();
    let resolveFirst = () => {};
    let rejectSecond = (_error: Error) => {};
    const firstRequest = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const secondRequest = new Promise<void>((_resolve, reject) => {
      rejectSecond = reject;
    });
    const failures: string[] = [];
    const firstRun = coordinator.run(() => firstRequest, {
      onSuccess: () => {},
      onError: () => failures.push("first"),
    });
    const secondRun = coordinator.run(() => secondRequest, {
      onSuccess: () => {},
      onError: () => failures.push("second"),
    });

    resolveFirst();
    rejectSecond(new Error("latest failed"));
    expect(await Promise.all([firstRun, secondRun])).toEqual([false, false]);
    expect(failures).toEqual(["second"]);
  });

  test("mutation success waits for the latest snapshot refresh", () => {
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");
    const coordinatorSource = readSource(
      "./platform-virtual-payment-refresh-coordinator.ts",
    );

    expect(virtualSource).toContain("async function refreshSnapshot(): Promise<boolean>");
    expect(virtualSource).toContain("createLatestRefreshCoordinator");
    expect(virtualSource).toContain("refreshCoordinator.current.run");
    expect(virtualSource).toContain("refreshCoordinator.current.invalidate");
    expect(coordinatorSource).toContain("return true;");
    expect(coordinatorSource).toContain("return false;");
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

  test("calls virtual payment configuration and channel credential APIs only", () => {
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");

    expect(virtualSource).toContain(
      '"/platform/payment/wechat-virtual/branding-entitlement"',
    );
    expect(virtualSource).toContain('method: "PATCH"');
    expect(virtualSource).toContain(
      "/platform/payment/wechat-virtual/channels/${environment}",
    );
    expect(virtualSource).toContain('method: "PUT"');
    expect(virtualSource).toContain("/secret-bundle");
    expect(virtualSource).toContain(
      '"/platform/payment/wechat-virtual/message-token"',
    );
    expect(virtualSource).toContain("refreshSnapshot");
    expect(virtualSource).not.toContain("goodsLifecycle");
    expect(virtualSource).not.toContain("PlatformVirtualPaymentGoodsFlow");
    expect(virtualSource).not.toContain("VirtualPaymentMappingCard");
    expect(virtualSource).not.toContain("/goods-status");
    expect(virtualSource).not.toContain("/goods/upload");
    expect(virtualSource).not.toContain("/goods/publish");
    expect(virtualSource).not.toContain("/validate");
  });

  test("uses safe shadcn composition and keeps product fields out of payment settings", () => {
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");
    const secretSource = readSource("./platform-virtual-payment-secret-form.tsx");
    const channelSource = readSource("./platform-virtual-payment-channel-card.tsx");
    const source = `${virtualSource}\n${secretSource}\n${channelSource}`;

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
    expect(source).not.toContain("providerProductId");
    expect(source).not.toContain("itemUrl");
    expect(source).not.toContain("expectedAmount");
    expect(source).not.toContain("商品图片");
    expect(source).not.toContain("渠道商品 ID");
    expect(source).not.toContain("核验价格");
    expect(source).not.toContain("微信商品流程");
    expect(channelSource).toContain("小程序 AppID");
    expect(channelSource).toContain("虚拟支付商户号");
    expect(channelSource).toContain("Offer ID");
  });

  test("remounts the secret form from the latest server revision", () => {
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");

    expect(virtualSource).toContain(
      "key={`${environment}:${summary.secret.revision ?? 0}:${snapshot.message_auth.message_token.valid}`}",
    );
  });

  test("skeleton mirrors the channel card and two secret columns", () => {
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");
    const skeletonBody = virtualSource.match(
      /function VirtualPaymentSettingsSkeleton\(\) \{([\s\S]*?)\n\}\n\nfunction VirtualPaymentCardSkeleton/,
    )?.[1] || "";

    expect(skeletonBody).toContain('["mode", "channel"]');
    expect(skeletonBody).toContain('["secret", "message-token"]');
    expect(skeletonBody).toContain('className="grid gap-4 xl:grid-cols-2"');
    expect(skeletonBody).not.toContain("showGoodsFlow");
    expect(skeletonBody).not.toContain("showImageUpload");
    expect(virtualSource).not.toContain('className="grid gap-3 md:grid-cols-3"');
  });

  test("exposes only allowlisted safe mutation errors", () => {
    const errorSource = readSource("./platform-virtual-payment-errors.ts");
    const renderedSources = [
      readSource("./platform-virtual-payment-settings.tsx"),
      readSource("./platform-virtual-payment-channel-card.tsx"),
      readSource("./platform-virtual-payment-secret-form.tsx"),
    ].join("\n");

    expect(errorSource).toContain("SAFE_VIRTUAL_PAYMENT_ERROR_MESSAGES");
    expect(errorSource).toContain("BRANDING_VIRTUAL_PAYMENT_NOT_READY");
    expect(errorSource).toContain("WECHAT_VIRTUAL_PAYMENT_SECRET_REVISION_CONFLICT");
    expect(errorSource).toContain("BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_TASK_MISSING");
    expect(errorSource).toContain("BRANDING_VIRTUAL_PRODUCT_WECHAT_PUBLISH_TASK_PENDING");
    expect(errorSource).toContain("BRANDING_VIRTUAL_PRODUCT_WECHAT_GOODS_INVALID");
    expect(errorSource).toContain("BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_REQUIRED");
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

  test("routes virtual product readiness blockers to the virtual product page", () => {
    const readinessSource = readSource(
      "../../../api/src/services/platform-branding-virtual-payment-readiness.ts",
    );

    expect(readinessSource).toContain(
      'const VIRTUAL_PRODUCT_HREF = "/platform/virtual-products"',
    );
    expect(readinessSource).toContain(
      '"请先配置生产环境虚拟商品映射", VIRTUAL_PRODUCT_HREF',
    );
    expect(readinessSource).toContain(
      '"请先通过生产环境虚拟商品映射校验", VIRTUAL_PRODUCT_HREF',
    );
  });

  test("does not validate or operate virtual products from payment settings", () => {
    const virtualSource = readSource("./platform-virtual-payment-settings.tsx");

    expect(virtualSource).not.toContain("validateMapping");
    expect(virtualSource).not.toContain("toSafeVirtualPaymentMutationFeedback");
    expect(virtualSource).not.toContain("校验未通过，且最新状态刷新失败");
    expect(virtualSource).toContain('href="/platform/virtual-products"');
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
