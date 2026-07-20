import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { platformNavGroups } from "@/components/layout/menu-config";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Platform wechat pay applyments page layout", () => {
  test("exposes platform nav entry for applyment review", () => {
    const operationGroup = platformNavGroups.find((group) => group.label === "平台运营");

    expect(operationGroup?.items).toContainEqual(
      expect.objectContaining({
        href: "/platform/wechat-pay/applyments",
        label: "支付进件",
      }),
    );
  });

  test("adds paginated platform applyment list page", () => {
    const pageUrl = new URL(
      "../../app/(console)/platform/wechat-pay/applyments/page.tsx",
      import.meta.url,
    );

    expect(existsSync(pageUrl)).toBe(true);
    const pageSource = readFileSync(pageUrl, "utf8");
    expect(pageSource).toContain("PlatformListPageShell");
    expect(pageSource).toContain("fetchPlatformWechatPayApplyments");
    expect(pageSource).toContain("PlatformWechatPayApplymentsTable");
    expect(pageSource).toContain("pageSize");
  });

  test("adds platform detail page with review and activation actions", () => {
    const pageUrl = new URL(
      "../../app/(console)/platform/wechat-pay/applyments/[id]/page.tsx",
      import.meta.url,
    );

    expect(existsSync(pageUrl)).toBe(true);
    const pageSource = readFileSync(pageUrl, "utf8");
    const requestSource = readSource("./platform-wechat-pay-applyment-requests.ts");
    const actionsSource = readSource("./platform-wechat-pay-applyment-actions.tsx");

    expect(pageSource).toContain("finance-wechat-pay-applyment-shared");
    expect(pageSource).toContain("申请附件");
    expect(pageSource).toContain("WechatPayApplymentAttachmentList");
    expect(pageSource).toContain("账户类型");
    expect(pageSource).toContain("银行账号");
    expect(pageSource).toContain("开户银行全称");
    expect(pageSource).toContain("联行号");
    expect(pageSource).not.toContain("finance-wechat-pay-applyment-requests");
    expect(requestSource).toContain("/platform/finance/wechat-pay/applyments?");
    expect(requestSource).toContain("/platform/finance/wechat-pay/applyments/");
    expect(actionsSource).toContain("/approve");
    expect(actionsSource).toContain("/reject");
    expect(actionsSource).toContain("/mark-applying");
    expect(actionsSource).toContain("/wechat-status");
    expect(actionsSource).toContain("/activate-config");
    expect(actionsSource).toContain("canRejectApplyment");
    expect(actionsSource).toContain("关闭或暂停已启用申请");
    expect(actionsSource).toContain("@/components/ui/select");
    expect(actionsSource).toContain("SelectGroup");
    expect(actionsSource).not.toContain("<select");
  });

  test("keeps platform applyment client table away from server-only request module", () => {
    const tableSource = readSource("./platform-wechat-pay-applyments-table.tsx");

    expect(tableSource).toContain("finance-wechat-pay-applyment-shared");
    expect(tableSource).not.toContain("finance-wechat-pay-applyment-requests");
  });

  test("activates from the validated central service-provider profile", () => {
    const actionsSource = readSource("./platform-wechat-pay-applyment-actions.tsx");

    expect(actionsSource).toContain("已验证的中央服务商配置");
    expect(actionsSource).toContain("submitJson(");
    expect(actionsSource).toMatch(/\/activate-config[\s\S]*?"POST",\s*\{\}/);
    expect(actionsSource).not.toContain('name="merchant_id"');
    expect(actionsSource).not.toContain('name="app_id"');
    expect(actionsSource).not.toContain('name="merchant_name"');
    expect(actionsSource).not.toContain('name="encrypted_config_ref"');
    expect(actionsSource).not.toContain('name="serial_no"');
    expect(actionsSource).not.toContain('name="notify_url"');
    expect(actionsSource).not.toContain('name="settlement_account_summary"');
    expect(actionsSource).toContain("StatusAlert");
    expect(actionsSource).toContain("Field");
    expect(actionsSource).toContain("Button");
  });
});
