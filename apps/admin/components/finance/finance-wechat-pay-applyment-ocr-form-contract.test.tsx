import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FinanceWechatPayApplymentFlow } from "./finance-wechat-pay-applyment-flow";
import {
  FinanceWechatPayApplymentRecognizedFields,
  getOcrComparisonValues,
  getStoredFieldSources,
} from "./finance-wechat-pay-applyment-recognized-fields";
import type { WechatPayApplymentRecord } from "./finance-wechat-pay-applyment-shared";
import {
  FinanceWechatPayApplymentSupplementFields,
  SUPPLEMENT_FIELD_NAMES,
} from "./finance-wechat-pay-applyment-supplement-fields";

const SUPER_OCR_FIELD_NAMES = [
  "license_name",
  "license_code",
  "license_address",
  "license_period_begin",
  "license_period_end",
  "legal_representative_name",
  "identity_name",
  "identity_number",
  "identity_address",
  "identity_period_begin",
  "identity_period_end",
  "super_admin_name",
  "contact_identity_number",
  "contact_identity_address",
  "contact_identity_period_begin",
  "contact_identity_period_end",
  "settlement_account_number",
  "settlement_bank_name",
] as const;

const FLOW_FIELD_NAMES = [
  "subject_type",
  "contact_type",
  ...SUPER_OCR_FIELD_NAMES,
  ...SUPPLEMENT_FIELD_NAMES,
] as const;

function registeredNames(markup: string) {
  return Array.from(markup.matchAll(/\sname="([^"]+)"/g), (match) => match[1]);
}

function count(values: readonly string[], target: string) {
  return values.filter((value) => value === target).length;
}

function renderRecognizedFields(
  contactType: "LEGAL" | "SUPER",
  subjectType = "SUBJECT_TYPE_ENTERPRISE",
) {
  return (
    <FinanceWechatPayApplymentRecognizedFields
      selectedCategory="license_copy"
      contactType={contactType}
      subjectType={subjectType}
      values={{}}
      fieldSources={{}}
      onManualChange={() => undefined}
    />
  );
}

function renderFlow(contactType: "LEGAL" | "SUPER") {
  return renderToStaticMarkup(
    <FinanceWechatPayApplymentFlow
      activeStage="materials"
      reachableStage="submit"
      subjectType="SUBJECT_TYPE_ENTERPRISE"
      contactType={contactType}
      disabled={false}
      navigationDisabled={false}
      materialsContent={null}
      recognitionContent={renderRecognizedFields(contactType)}
      supplementContent={(
        <FinanceWechatPayApplymentSupplementFields
          applyment={null}
          subjectType="SUBJECT_TYPE_ENTERPRISE"
          contactType={contactType}
          disabled={false}
          navigationDisabled={false}
          onReturnToMaterials={() => undefined}
          onDataChange={() => undefined}
        />
      )}
      submitContent={null}
      onStageChange={() => undefined}
      onNextStage={() => undefined}
      onSubjectTypeChange={() => undefined}
      onContactTypeChange={() => undefined}
    />,
  );
}

describe("wechat pay applyment OCR form registration", () => {
  test("keeps identity address optional for an individual subject", () => {
    const markup = renderToStaticMarkup(
      renderRecognizedFields("LEGAL", "SUBJECT_TYPE_INDIVIDUAL"),
    );
    const control = markup.match(
      /<input[^>]*name="identity_address"[^>]*>/,
    )?.[0];

    expect(control).toBeDefined();
    expect(control).not.toContain("required");
  });

  test("keeps bank account required unless its own masked value exists", () => {
    const identityOnly = {
      has_sensitive_payload: true,
      settlement_account_number_masked: null,
    } as WechatPayApplymentRecord;
    const withBankAccount = {
      ...identityOnly,
      settlement_account_number_masked: "6222••••8888",
    };

    expect(getStoredFieldSources(identityOnly, {})).toMatchObject({
      identity_name: "stored",
    });
    expect(getStoredFieldSources(identityOnly, {}))
      .not.toHaveProperty("settlement_account_number");
    expect(getStoredFieldSources(withBankAccount, {}))
      .toHaveProperty("settlement_account_number", "stored");
    expect(getOcrComparisonValues(withBankAccount, {}))
      .toHaveProperty("settlement_account_number", "已安全保存");
  });

  test("keeps every stage mounted and registers each SUPER control once", () => {
    const markup = renderFlow("SUPER");
    const names = registeredNames(markup);

    for (const name of FLOW_FIELD_NAMES) {
      expect(count(names, name)).toBe(1);
    }
    expect(markup.match(/data-applyment-stage=/g)).toHaveLength(4);
    expect(markup.match(/data-ocr-category=/g)).toHaveLength(6);
    expect(markup).toContain('data-applyment-stage="recognition" hidden=""');
    expect(markup).toContain('data-applyment-stage="supplement" hidden=""');
    expect(markup).toContain('data-applyment-stage="submit" hidden=""');
  });

  test("registers required OCR and supplement controls natively", () => {
    const markup = renderFlow("SUPER");

    for (const name of [
      "license_name",
      "identity_name",
      "super_admin_name",
      "settlement_account_number",
      "merchant_short_name",
      "super_admin_phone",
      "super_admin_email",
      "service_phone",
      "settlement_account_name",
      "business_scene_description",
      "contact_address",
    ]) {
      const control = markup.match(
        new RegExp(
          `<(?:input|textarea)[^>]*name="${name}"[^>]*>`,
        ),
      )?.[0];
      expect(control).toContain("required");
    }
  });

  test("keeps completed stage navigation enabled for a read-only form", () => {
    const markup = renderToStaticMarkup(
      <FinanceWechatPayApplymentFlow
        activeStage="submit"
        reachableStage="submit"
        subjectType="SUBJECT_TYPE_ENTERPRISE"
        contactType="LEGAL"
        disabled
        navigationDisabled={false}
        materialsContent={null}
        recognitionContent={null}
        supplementContent={null}
        submitContent={null}
        onStageChange={() => undefined}
        onNextStage={() => undefined}
        onSubjectTypeChange={() => undefined}
        onContactTypeChange={() => undefined}
      />,
    );
    const stageButton = Array.from(
      markup.matchAll(/<button([^>]*)>(.*?)<\/button>/g),
    ).find((match) => match[2].includes("上传资料"));

    expect(stageButton).toBeDefined();
    expect(stageButton?.[1]).not.toContain(" disabled=");
  });

  test("disables stages beyond the current reachable guard cap", () => {
    const markup = renderToStaticMarkup(
      <FinanceWechatPayApplymentFlow
        activeStage="materials"
        reachableStage="materials"
        subjectType="SUBJECT_TYPE_ENTERPRISE"
        contactType="LEGAL"
        disabled={false}
        navigationDisabled={false}
        materialsContent={null}
        recognitionContent={null}
        supplementContent={null}
        submitContent={null}
        onStageChange={() => undefined}
        onNextStage={() => undefined}
        onSubjectTypeChange={() => undefined}
        onContactTypeChange={() => undefined}
      />,
    );
    const stageButtons = Array.from(
      markup.matchAll(/<button([^>]*)>(.*?)<\/button>/g),
    );
    const attributesFor = (label: string) =>
      stageButtons.find((match) => match[2].includes(label))?.[1];

    expect(attributesFor("上传资料")).not.toContain(" disabled=");
    expect(attributesFor("核对识别")).toContain("disabled");
    expect(attributesFor("确认提交")).toContain("disabled");
  });
});
