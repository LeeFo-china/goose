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
    const fieldSource = readSource("./finance-wechat-pay-applyment-form-fields.tsx");
    const attachmentSource = readSource("./finance-wechat-pay-applyment-attachments.tsx");

    expect(requestSource).toContain("/finance/wechat-pay/applyment/current");
    expect(panelSource).toContain("/finance/wechat-pay/applyments");
    expect(panelSource).toContain("/submit");
    expect(panelSource).toContain("WechatPayApplymentAttachmentsField");
    expect(attachmentSource).toContain("uploadDirectToCos");
    expect(attachmentSource).toContain("wechat_pay_applyment");
    expect(attachmentSource).toContain("license_copy");
    expect(attachmentSource).toContain("legal_representative_id_card_front");
    expect(panelSource).toContain("attachments");
    expect(panelSource).toContain("merchant_short_name");
    expect(panelSource).toContain("super_admin_phone");
    expect(panelSource).toContain("settlement_account_type");
    expect(panelSource).toContain("settlement_account_number");
    expect(panelSource).toContain("settlement_bank_full_name");
    expect(panelSource).toContain("settlement_bank_branch_id");
    expect(fieldSource).toContain("@/components/ui/select");
    expect(fieldSource).toContain("SelectGroup");
    expect(panelSource).toContain('requirement="required"');
    expect(panelSource).toContain('requirement="optional"');
    expect(panelSource).toContain("标记为必填的字段会影响保存和提交");
    expect(panelSource).not.toContain("settlement_account_summary: requiredText");
    expect(panelSource).not.toContain("api_v3_key");
  });

  test("tenant applyment form marks required optional and attachment requirements", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const fieldSource = readSource("./finance-wechat-pay-applyment-form-fields.tsx");
    const attachmentSource = readSource("./finance-wechat-pay-applyment-attachments.tsx");

    expect(fieldSource).toContain("RequirementBadge");
    expect(fieldSource).toContain("必填");
    expect(fieldSource).toContain("选填");
    expect(fieldSource).toContain("required={required}");
    expect(fieldSource).toContain("aria-required");
    expect(panelSource).toContain("用于微信支付开户联系");
    expect(panelSource).toContain("保存后只记录掩码");
    expect(panelSource).toContain("填写银行基础名称");
    expect(attachmentSource).toContain("必传");
    expect(attachmentSource).toContain("选传");
  });

  test("tenant applyment submit persists current form and attachments before submit", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");

    expect(panelSource).toContain("formRef");
    expect(panelSource).toContain("saveApplymentDraft(payload)");
    expect(panelSource).toContain("const savedDetail = await saveApplymentDraft(payload)");
    expect(panelSource).toContain("targetApplyment.id");
  });

  test("tenant applyment attachment uploader uses shadcn button for the visible upload action", () => {
    const attachmentSource = readSource("./finance-wechat-pay-applyment-attachments.tsx");

    expect(attachmentSource).toContain("<Button");
    expect(attachmentSource).toContain("openAttachmentPicker");
    expect(attachmentSource).not.toContain("inline-flex h-9 cursor-pointer");
    expect(attachmentSource).not.toContain("<label");
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
