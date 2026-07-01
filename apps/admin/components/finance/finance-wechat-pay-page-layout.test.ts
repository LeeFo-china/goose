import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { tenantNavGroups } from "@/components/layout/menu-config";

describe("Finance wechat pay admin page layout", () => {
  test("exposes tenant finance sidebar entry with config read permission", () => {
    const financeGroup = tenantNavGroups.find((group) => group.label === "财务");

    expect(financeGroup?.items).toContainEqual(
      expect.objectContaining({
        href: "/finance/wechat-pay",
        label: "微信支付",
        permission: "wechat_pay.config.read",
      }),
    );
  });

  test("page uses finance tabs and config form", () => {
    const pageSource = readFileSync(
      new URL("../../app/(console)/finance/wechat-pay/page.tsx", import.meta.url),
      "utf8",
    );

    expect(pageSource).toContain('activeTab="wechat-pay"');
    expect(pageSource).toContain("FinanceWechatPayConfigForm");
    expect(pageSource).toContain("fetchWechatPayConfig");
  });
});
