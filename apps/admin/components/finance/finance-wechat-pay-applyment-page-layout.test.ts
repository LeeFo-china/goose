import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { tenantNavGroups } from "@/components/layout/menu-config";
import { FINANCE_MODULE_TABS } from "./finance-module-tabs";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Finance wechat pay applyment page layout", () => {
  test("exposes tenant sidebar and finance tab entry for applyment flow", () => {
    const financeGroup = tenantNavGroups.find((group) => group.label === "财务");

    expect(financeGroup?.items).toContainEqual(
      expect.objectContaining({
        href: "/finance/wechat-pay/applyment",
        label: "支付开通",
        permission: "wechat_pay.applyment.read",
      }),
    );
    expect(FINANCE_MODULE_TABS).toContainEqual({
      value: "wechat-pay-applyment",
      label: "支付开通",
      href: "/finance/wechat-pay/applyment",
    });
  });

  test("adds tenant applyment page wired to requests and form component", () => {
    const pageUrl = new URL(
      "../../app/(console)/finance/wechat-pay/applyment/page.tsx",
      import.meta.url,
    );

    expect(existsSync(pageUrl)).toBe(true);
    const pageSource = readFileSync(pageUrl, "utf8");
    expect(pageSource).toContain('activeTab="wechat-pay-applyment"');
    expect(pageSource).toContain("fetchWechatPayApplymentCurrent");
    expect(pageSource).toContain("FinanceWechatPayApplymentPanel");
    expect(pageSource).toContain("/finance/wechat-pay");
  });

  test("tenant applyment panel posts create update and submit actions", () => {
    const requestSource = readSource("./finance-wechat-pay-applyment-requests.ts");
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");

    expect(requestSource).toContain("/finance/wechat-pay/applyment/current");
    expect(panelSource).toContain("/finance/wechat-pay/applyments");
    expect(panelSource).toContain("/submit");
    expect(panelSource).toContain("merchant_short_name");
    expect(panelSource).toContain("super_admin_phone");
    expect(panelSource).not.toContain("api_v3_key");
  });

  test("keeps tenant applyment client panel away from server-only request module", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const sharedSource = readSource("./finance-wechat-pay-applyment-shared.ts");
    const requestSource = readSource("./finance-wechat-pay-applyment-requests.ts");

    expect(panelSource).toContain("./finance-wechat-pay-applyment-shared");
    expect(panelSource).not.toContain("./finance-wechat-pay-applyment-requests");
    expect(sharedSource).not.toContain("@/lib/auth");
    expect(sharedSource).not.toContain("next/headers");
    expect(requestSource).toContain("./finance-wechat-pay-applyment-shared");
  });
});
