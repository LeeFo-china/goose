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
    const stepsSource = readSource("./finance-wechat-pay-applyment-steps.tsx");
    const schemaSource = readSource("./finance-wechat-pay-applyment-schema.ts");
    const attachmentSource = readSource("./finance-wechat-pay-applyment-attachments.tsx");
    const formContractSource = `${panelSource}\n${stepsSource}\n${schemaSource}`;

    expect(requestSource).toContain("/finance/wechat-pay/applyment/current");
    expect(panelSource).toContain("/finance/wechat-pay/applyments");
    expect(panelSource).toContain("/submit");
    expect(panelSource).toContain("WechatPayApplymentAttachmentsField");
    expect(attachmentSource).toContain("uploadDirectToCos");
    expect(attachmentSource).toContain("wechat_pay_applyment");
    expect(attachmentSource).toContain("license_copy");
    expect(attachmentSource).toContain("legal_representative_id_card_front");
    expect(panelSource).toContain("attachments");
    expect(formContractSource).toContain("merchant_short_name");
    expect(formContractSource).toContain("super_admin_phone");
    expect(formContractSource).toContain("settlement_account_type");
    expect(formContractSource).toContain("settlement_account_number");
    expect(formContractSource).toContain("settlement_bank_full_name");
    expect(formContractSource).toContain("settlement_bank_branch_id");
    expect(fieldSource).toContain("@/components/ui/select");
    expect(fieldSource).toContain("SelectGroup");
    expect(stepsSource).toContain('requirement="required"');
    expect(stepsSource).toContain('requirement="optional"');
    expect(formContractSource).not.toContain("settlement_account_summary: requiredText");
    expect(formContractSource).not.toContain("api_v3_key");
  });

  test("tenant applyment form marks required optional and attachment requirements", () => {
    const fieldSource = readSource("./finance-wechat-pay-applyment-form-fields.tsx");
    const stepsSource = readSource("./finance-wechat-pay-applyment-steps.tsx");
    const attachmentSource = readSource("./finance-wechat-pay-applyment-attachments.tsx");

    expect(fieldSource).toContain("RequirementBadge");
    expect(fieldSource).toContain("必填");
    expect(fieldSource).toContain("选填");
    expect(fieldSource).toContain("required={required}");
    expect(fieldSource).toContain("aria-required");
    expect(stepsSource).toContain("用于微信支付开户联系");
    expect(stepsSource).toContain("保存后只记录掩码");
    expect(stepsSource).toContain("填写银行基础名称");
    expect(attachmentSource).toContain("必传");
    expect(attachmentSource).toContain("选传");
  });

  test("uses one linked settlement rule select instead of technical text inputs", () => {
    const stepsSource = readSource("./finance-wechat-pay-applyment-steps.tsx");
    const ruleFieldUrl = new URL(
      "./finance-wechat-pay-settlement-rule-field.tsx",
      import.meta.url,
    );

    expect(existsSync(ruleFieldUrl)).toBe(true);
    expect(stepsSource).toContain("FinanceWechatPaySettlementRuleField");
    expect(stepsSource).not.toContain('<TextField label="结算规则 ID"');
    expect(stepsSource).not.toContain('<TextField label="所属行业"');
    if (!existsSync(ruleFieldUrl)) return;

    const ruleFieldSource = readFileSync(ruleFieldUrl, "utf8");
    expect(ruleFieldSource).toContain("getWechatPaySettlementRulesForSubject");
    expect(ruleFieldSource).toContain("@/components/ui/select");
    expect(ruleFieldSource).toContain('name="settlement_id"');
    expect(ruleFieldSource).toContain('name="qualification_type"');
    expect(ruleFieldSource).toContain("经营行业与结算规则");
    expect(ruleFieldSource).toContain("rateLabel");
    expect(ruleFieldSource).toContain("settlementCycleLabel");
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

  test("uses a four-step shadcn form for the complete official applyment contract", () => {
    const stepsUrl = new URL(
      "./finance-wechat-pay-applyment-steps.tsx",
      import.meta.url,
    );
    const reviewUrl = new URL(
      "./finance-wechat-pay-applyment-review.tsx",
      import.meta.url,
    );
    const schemaUrl = new URL(
      "./finance-wechat-pay-applyment-schema.ts",
      import.meta.url,
    );

    expect(existsSync(stepsUrl)).toBe(true);
    expect(existsSync(reviewUrl)).toBe(true);
    expect(existsSync(schemaUrl)).toBe(true);
    if (!existsSync(stepsUrl) || !existsSync(reviewUrl) || !existsSync(schemaUrl)) {
      return;
    }

    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const stepsSource = readFileSync(stepsUrl, "utf8");
    const reviewSource = readFileSync(reviewUrl, "utf8");
    const schemaSource = readFileSync(schemaUrl, "utf8");
    const attachmentSource = readSource(
      "./finance-wechat-pay-applyment-attachments.tsx",
    );

    expect(panelSource).toContain("FinanceWechatPayApplymentSteps");
    expect(panelSource).toContain("FinanceWechatPayApplymentReview");
    expect(panelSource).toContain("AlertDialog");
    expect(panelSource).toContain("Progress");
    expect(stepsSource).toContain("SUBJECT_TYPE_ENTERPRISE");
    expect(stepsSource).toContain("SUBJECT_TYPE_INDIVIDUAL");
    expect(schemaSource).toContain("IDENTIFICATION_TYPE_IDCARD");
    expect(stepsSource).toContain('contactType === "SUPER"');
    expect(stepsSource).toContain("已安全保存");
    expect(reviewSource).toContain("确认资料真实有效");
    expect(schemaSource).toContain("contact_identity_number");
    expect(schemaSource).toContain("settlement_account_number");
    expect(schemaSource).toContain("delete payload.contact_identity_number");
    expect(attachmentSource).not.toContain("image/bmp");
    expect(attachmentSource).toContain("image/jpeg,image/png");
    expect(attachmentSource).toContain("2 * 1024 * 1024");
    expect(attachmentSource).toContain("contact_id_card_front");
    expect(attachmentSource).toContain("contact_id_card_back");
    expect(attachmentSource).toContain("MAX_BUSINESS_SCENE_MATERIALS = 5");
    expect(attachmentSource).not.toContain("image/webp");
    expect(panelSource).not.toMatch(/<select\b/);
  });
});
