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
    expect(pageSource).toContain("PlatformWechatPayApplymentFilters");
    expect(pageSource).toContain("pageSize");
    expect(pageSource).toContain("wechat_editing");
    expect(pageSource).toContain("opening");
    expect(pageSource).toContain("grid grid-cols-2 gap-3 md:grid-cols-4");
    expect(pageSource).not.toContain("回填服务商人工进件");
  });

  test("uses shadcn controls for platform applyment filters", () => {
    const filtersUrl = new URL(
      "./platform-wechat-pay-applyment-filters.tsx",
      import.meta.url,
    );

    expect(existsSync(filtersUrl)).toBe(true);
    if (!existsSync(filtersUrl)) return;
    const filtersSource = readFileSync(filtersUrl, "utf8");

    expect(filtersSource).toContain('@/components/ui/button');
    expect(filtersSource).toContain('@/components/ui/field');
    expect(filtersSource).toContain('@/components/ui/input');
    expect(filtersSource).toContain('@/components/ui/select');
    expect(filtersSource).toContain("全部状态");
    expect(filtersSource).toContain("申请 ID");
    expect(filtersSource).toContain("重置");
    expect(filtersSource).not.toContain("<select");
    expect(filtersSource).not.toContain("<input");
    expect(filtersSource).not.toContain("<button");
  });

  test("adds platform detail page with official progress and backend actions", () => {
    const pageUrl = new URL(
      "../../app/(console)/platform/wechat-pay/applyments/[id]/page.tsx",
      import.meta.url,
    );
    const progressUrl = new URL(
      "./platform-wechat-pay-applyment-progress.tsx",
      import.meta.url,
    );
    const syncUrl = new URL(
      "./platform-wechat-pay-applyment-sync.tsx",
      import.meta.url,
    );
    const submitDialogUrl = new URL(
      "./platform-wechat-pay-applyment-submit-dialog.tsx",
      import.meta.url,
    );
    const readinessUrl = new URL(
      "./platform-wechat-pay-applyment-readiness.tsx",
      import.meta.url,
    );

    expect(existsSync(pageUrl)).toBe(true);
    expect(existsSync(progressUrl)).toBe(true);
    expect(existsSync(syncUrl)).toBe(true);
    expect(existsSync(submitDialogUrl)).toBe(true);
    expect(existsSync(readinessUrl)).toBe(true);
    if (
      !existsSync(progressUrl) || !existsSync(syncUrl) ||
      !existsSync(submitDialogUrl) || !existsSync(readinessUrl)
    ) return;
    const pageSource = readFileSync(pageUrl, "utf8");
    const requestSource = readSource("./platform-wechat-pay-applyment-requests.ts");
    const actionsSource = readSource("./platform-wechat-pay-applyment-actions.tsx");
    const progressSource = readFileSync(progressUrl, "utf8");
    const syncSource = readFileSync(syncUrl, "utf8");
    const submitDialogSource = readFileSync(submitDialogUrl, "utf8");
    const readinessSource = readFileSync(readinessUrl, "utf8");

    expect(pageSource).toContain("finance-wechat-pay-applyment-shared");
    expect(pageSource).toContain("PlatformWechatPayApplymentProgress");
    expect(pageSource).toContain("PlatformWechatPayApplymentReadiness");
    expect(pageSource).toContain("submission_readiness");
    expect(pageSource).toContain('data-testid="platform-applyment-workspace"');
    expect(pageSource).toContain('data-testid="platform-applyment-action-rail"');
    expect(pageSource).toContain("order-first");
    expect(pageSource).toContain("xl:sticky");
    expect(pageSource).toContain("available_actions");
    expect(pageSource).toContain("申请附件");
    expect(pageSource).toContain("WechatPayApplymentAttachmentList");
    expect(pageSource).toContain("账户类型");
    expect(pageSource).toContain("银行账号");
    expect(pageSource).toContain("开户银行全称");
    expect(pageSource).toContain("联行号");
    expect(pageSource).toContain("主体类型");
    expect(pageSource).toContain("营业执照有效期");
    expect(pageSource).toContain("法人证件有效期");
    expect(pageSource).toContain("超级管理员类型");
    expect(pageSource).toContain("客服电话");
    expect(pageSource).toContain("结算规则");
    expect(pageSource).toContain("所属行业");
    expect(pageSource).not.toContain("finance-wechat-pay-applyment-requests");
    expect(requestSource).toContain("/platform/finance/wechat-pay/applyments?");
    expect(requestSource).toContain("/platform/finance/wechat-pay/applyments/");
    expect(actionsSource).toContain("/approve");
    expect(actionsSource).toContain("/reject");
    expect(actionsSource).toContain("submit_to_wechat");
    expect(actionsSource).toContain("sync_wechat_status");
    expect(actionsSource).toContain("open_sign_url");
    expect(actionsSource).toContain("activate_payment_config");
    expect(actionsSource).toContain("repair_wechat_state");
    expect(actionsSource).toContain("/submit-to-wechat");
    expect(actionsSource).toContain("/repair-wechat-state");
    expect(actionsSource).toContain("/activate-config");
    expect(actionsSource).not.toContain("/mark-applying");
    expect(actionsSource).not.toContain("/wechat-status");
    expect(actionsSource).not.toContain("微信状态回填");
    expect(actionsSource).not.toContain("<select");
    expect(actionsSource).toContain('defaultValue=""');
    expect(progressSource).toContain("last_wechat_request_id");
    expect(progressSource).toContain("last_wechat_synced_at");
    expect(progressSource).toContain("audit_detail");
    expect(progressSource).toContain("sub_mchid");
    expect(progressSource).toContain("aria-current");
    expect(progressSource).toContain('"step"');
    expect(progressSource).toContain("grid grid-cols-2 gap-4 border-t");
    expect(syncSource).toContain('document.visibilityState === "visible"');
    expect(syncSource).toContain("30_000");
    expect(submitDialogSource).toContain("AlertDialog");
    expect(readinessSource).toContain("review_ready");
    expect(readinessSource).toContain("APPLYMENT_REQUIRED_FIELD_MISSING");
    expect(readinessSource).toContain("PLATFORM_PAYMENT_CONFIG_MISSING");
    expect(readinessSource).toContain("/settings?group=payment");
    expect(readinessSource).toContain("Alert");
    expect(readinessSource).toContain("Button");
  });

  test("keeps platform applyment client table away from server-only request module", () => {
    const tableSource = readSource("./platform-wechat-pay-applyments-table.tsx");

    expect(tableSource).toContain("finance-wechat-pay-applyment-shared");
    expect(tableSource).not.toContain("finance-wechat-pay-applyment-requests");
  });

  test("shows a readable settlement rule while retaining raw audit values", () => {
    const pageSource = readFileSync(
      new URL(
        "../../app/(console)/platform/wechat-pay/applyments/[id]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(pageSource).not.toContain("findWechatPaySettlementRule");
    expect(pageSource).toContain('label="经营行业与结算规则"');
    expect(pageSource).toContain("formatSettlementRuleLabel");
    expect(pageSource).toContain("微信规则 ID");
    expect(pageSource).toContain("applyment.settlement_id");
    expect(pageSource).toContain("applyment.qualification_type");
  });

  test("explains an invalid historical settlement rule in preflight", () => {
    const readinessSource = readSource(
      "./platform-wechat-pay-applyment-readiness.tsx",
    );

    expect(readinessSource).toContain("APPLYMENT_SETTLEMENT_RULE_INVALID");
    expect(readinessSource).toContain("结算规则与主体或所属行业不匹配");
  });

  test("activates from the validated central profile only when backend exposes it", () => {
    const actionsSource = readSource("./platform-wechat-pay-applyment-actions.tsx");

    expect(actionsSource).toContain("已验证的中央服务商配置");
    expect(actionsSource).toContain("availableActions");
    expect(actionsSource).toContain('hasAction("activate_payment_config")');
    expect(actionsSource).toMatch(/\/activate-config[\s\S]*?"POST",\s*\{\}/);
    expect(actionsSource).not.toContain('name="merchant_id"');
    expect(actionsSource).not.toContain('name="app_id"');
    expect(actionsSource).not.toContain('name="merchant_name"');
    expect(actionsSource).not.toContain('name="encrypted_config_ref"');
    expect(actionsSource).not.toContain('name="serial_no"');
    expect(actionsSource).not.toContain('name="notify_url"');
    expect(actionsSource).not.toContain('name="settlement_account_summary"');
    expect(actionsSource).toContain("StatusAlert");
    expect(actionsSource).toContain("Button");
    expect(actionsSource).toContain("PlatformWechatPayApplymentSubmitDialog");
  });
});
