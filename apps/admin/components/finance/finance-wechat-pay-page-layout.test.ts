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
        activeMatch: "exact",
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

  test("config form exposes sub merchant onboarding and appid binding fields", () => {
    const formSource = readFileSync(
      new URL("./finance-wechat-pay-config-form.tsx", import.meta.url),
      "utf8",
    );
    const requestSource = readFileSync(
      new URL("./finance-wechat-pay-requests.ts", import.meta.url),
      "utf8",
    );

    expect(requestSource).toContain("principal_type");
    expect(requestSource).toContain("applyment_state");
    expect(requestSource).toContain("appid_binding_state");
    expect(formSource).toContain("收款主体");
    expect(formSource).toContain("进件业务编号");
    expect(formSource).toContain("微信申请单号");
    expect(formSource).toContain("进件状态");
    expect(formSource).toContain("AppID 绑定状态");
  });

  test("keeps centrally managed service-provider config read-only", () => {
    const formSource = readFileSync(
      new URL("./finance-wechat-pay-config-form.tsx", import.meta.url),
      "utf8",
    );
    const requestSource = readFileSync(
      new URL("./finance-wechat-pay-requests.ts", import.meta.url),
      "utf8",
    );

    expect(requestSource).toContain("managed_by_platform: boolean");
    expect(formSource).toContain("data.config?.managed_by_platform");
    expect(formSource).toContain("由平台进件激活流程统一维护");
    expect(formSource).toContain("disabled: true");
  });

  test("config form uses shadcn select components instead of native select controls", () => {
    const formSource = readFileSync(
      new URL("./finance-wechat-pay-config-form.tsx", import.meta.url),
      "utf8",
    );

    expect(formSource).toContain("@/components/ui/select");
    expect(formSource).toContain("SelectGroup");
    expect(formSource).not.toContain("<select");
  });
});
