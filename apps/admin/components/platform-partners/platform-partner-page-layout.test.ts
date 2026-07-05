import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Platform partner operation page", () => {
  test("registers the platform partner entry in platform navigation", () => {
    const source = readSource("../layout/menu-config.ts");

    expect(source).toContain('href: "/platform/partners"');
    expect(source).toContain('label: "城市合伙人"');
  });

  test("uses the fixed platform list workspace with standard shadcn tabs", () => {
    const pageUrl = new URL(
      "../../app/(console)/platform/partners/page.tsx",
      import.meta.url,
    );
    expect(existsSync(pageUrl)).toBe(true);

    const source = readFileSync(pageUrl, "utf8");
    const tabsSource = `${source}\n${readSource("./platform-partner-filters.tsx")}`;
    expect(source).toContain("PlatformListPageShell");
    expect(source).toContain("h-[calc(100vh-6.5625rem)]");
    expect(source).toContain("TabsList");
    expect(source).toContain("TabsTrigger");
    expect(source).toContain("TabsContent");
    expect(tabsSource).toContain("申请线索");
    expect(tabsSource).toContain("合伙人");
    expect(tabsSource).toContain("装企绑定");
    expect(tabsSource).toContain("平台收入");
    expect(tabsSource).toContain("分佣台账");
    expect(tabsSource).toContain("月结批次");
    expect(source).not.toContain("listHeader=");
    expect(source).not.toContain("当前筛选：");
  });

  test("exposes the MVP operation actions through backend endpoints", () => {
    const source = `${readSource("./platform-partner-actions.tsx")}\n${
      readSource("./platform-partner-application-actions.tsx")
    }`;

    expect(source).toContain("/platform/partner-applications/${application.id}/approve");
    expect(source).toContain("/platform/partner-applications/${application.id}/status");
    expect(source).toContain("/platform/partners");
    expect(source).toContain("/platform/partner-bindings");
    expect(source).toContain("/platform/partner-revenue/lead-service-fees");
    expect(source).toContain("/platform/partner-revenue/recharge-events/sync");
    expect(source).toContain("/platform/partner-settlements/monthly-batches");
    expect(source).toContain("/platform/partner-settlements/${batch.id}/mark-paid");
  });
});
