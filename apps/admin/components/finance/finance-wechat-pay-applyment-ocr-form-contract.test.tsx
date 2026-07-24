import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

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

const SINGLE_PAGE_FIELD_NAMES = [
  "subject_type",
  "contact_type",
  ...SUPER_OCR_FIELD_NAMES,
  ...SUPPLEMENT_FIELD_NAMES,
] as const;

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function registeredNames(source: string) {
  return Array.from(
    source.matchAll(/\sname="([^"]+)"/g),
    (match) => match[1],
  );
}

function count(values: readonly string[], target: string) {
  return values.filter((value) => value === target).length;
}

function countJsxTag(source: string, component: string) {
  return source.match(new RegExp(`<${component}\\b`, "g"))?.length ?? 0;
}

function renderRecognizedFields(
  contactType: "LEGAL" | "SUPER",
  subjectType = "SUBJECT_TYPE_ENTERPRISE",
  disabled = false,
) {
  return (
    <FinanceWechatPayApplymentRecognizedFields
      selectedCategory="license_copy"
      contactType={contactType}
      subjectType={subjectType}
      values={{}}
      fieldSources={{}}
      disabled={disabled}
      onManualChange={() => undefined}
    />
  );
}

function renderSinglePageFieldGroups(
  contactType: "LEGAL" | "SUPER",
  subjectType = "SUBJECT_TYPE_ENTERPRISE",
  disabled = false,
) {
  return renderToStaticMarkup(
    <>
      {renderRecognizedFields(contactType, subjectType, disabled)}
      <FinanceWechatPayApplymentSupplementFields
        applyment={null}
        subjectType={subjectType}
        contactType={contactType}
        disabled={disabled}
        navigationDisabled={false}
        onReturnToMaterials={() => undefined}
        onDataChange={() => undefined}
      />
    </>,
  );
}

describe("wechat pay applyment OCR form registration", () => {
  test("composes the future single page from one owner for every field group", () => {
    const singlePageUrl = new URL(
      "./finance-wechat-pay-applyment-single-page.tsx",
      import.meta.url,
    );
    const documentSectionUrl = new URL(
      "./finance-wechat-pay-applyment-document-section.tsx",
      import.meta.url,
    );

    expect(existsSync(singlePageUrl)).toBe(true);
    expect(existsSync(documentSectionUrl)).toBe(true);
    if (!existsSync(singlePageUrl) || !existsSync(documentSectionUrl)) return;

    const singlePageSource = readFileSync(singlePageUrl, "utf8");
    const documentSectionSource = readFileSync(documentSectionUrl, "utf8");
    const recognizedFieldsSource = readSource(
      "./finance-wechat-pay-applyment-recognized-fields.tsx",
    );
    const supplementSource = readSource(
      "./finance-wechat-pay-applyment-supplement-fields.tsx",
    );
    const names = registeredNames(
      `${singlePageSource}\n${recognizedFieldsSource}\n${supplementSource}`,
    );

    expect(singlePageSource).not.toContain("FinanceWechatPayApplymentFlow");
    expect(singlePageSource).toContain(
      "<FinanceWechatPayApplymentDocumentSection",
    );
    expect(documentSectionSource).toContain(
      "<FinanceWechatPayApplymentInlineOcrReview",
    );
    expect(
      countJsxTag(
        singlePageSource,
        "FinanceWechatPayApplymentContactFields",
      ),
    ).toBe(1);
    expect(
      countJsxTag(
        singlePageSource,
        "FinanceWechatPayApplymentSettlementFields",
      ),
    ).toBe(1);
    expect(
      countJsxTag(
        singlePageSource,
        "FinanceWechatPayApplymentBusinessFields",
      ),
    ).toBe(1);
    for (const name of SINGLE_PAGE_FIELD_NAMES) {
      expect(count(names, name)).toBe(1);
    }
  });

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

  test("keeps legal identity fields required for an enterprise subject", () => {
    const markup = renderSinglePageFieldGroups("LEGAL");

    for (const name of [
      "license_name",
      "identity_name",
      "identity_number",
      "merchant_short_name",
      "super_admin_phone",
      "settlement_account_number",
    ]) {
      const control = markup.match(
        new RegExp(`<(?:input|textarea)[^>]*name="${name}"[^>]*>`),
      )?.[0];
      expect(control).toContain("required");
    }
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

  test("registers each SUPER OCR and supplement control once", () => {
    const names = registeredNames(renderSinglePageFieldGroups("SUPER"));

    for (const name of [
      ...SUPER_OCR_FIELD_NAMES,
      ...SUPPLEMENT_FIELD_NAMES,
    ]) {
      expect(count(names, name)).toBe(1);
    }
  });

  test("registers required OCR and supplement controls natively", () => {
    const markup = renderSinglePageFieldGroups("SUPER");

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
        new RegExp(`<(?:input|textarea)[^>]*name="${name}"[^>]*>`),
      )?.[0];
      expect(control).toContain("required");
    }
  });

  test("keeps registered fields visible when the single-page form is read-only", () => {
    const markup = renderSinglePageFieldGroups("SUPER", undefined, true);

    for (const name of [
      "license_name",
      "identity_name",
      "contact_identity_number",
      "merchant_short_name",
      "super_admin_phone",
      "settlement_account_number",
      "business_scene_description",
    ]) {
      const control = markup.match(
        new RegExp(`<(?:input|textarea)[^>]*name="${name}"[^>]*>`),
      )?.[0];
      expect(control).toBeDefined();
      expect(control).toContain("disabled");
    }
  });
});
