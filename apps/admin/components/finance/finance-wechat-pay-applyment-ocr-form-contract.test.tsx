import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FinanceWechatPayApplymentRecognizedFields,
  getOcrComparisonValues,
  getStoredFieldSources,
} from "./finance-wechat-pay-applyment-recognized-fields";
import type {
  WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";
import {
  FinanceWechatPayApplymentSteps,
} from "./finance-wechat-pay-applyment-steps";

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
  return renderToStaticMarkup(
    <FinanceWechatPayApplymentRecognizedFields
      selectedCategory="license_copy"
      contactType={contactType}
      subjectType={subjectType}
      values={{}}
      fieldSources={{}}
      onManualChange={() => undefined}
    />,
  );
}

function renderLegacySteps(contactType: "LEGAL" | "SUPER") {
  return renderToStaticMarkup(
    <FinanceWechatPayApplymentSteps
      applyment={null}
      activeStep="subject"
      subjectType="SUBJECT_TYPE_ENTERPRISE"
      contactType={contactType}
      editable
      disabled={false}
      attachmentsContent={null}
      reviewContent={null}
      ocrFieldValues={{}}
      onStepChange={() => undefined}
      onSubjectTypeChange={() => undefined}
      onContactTypeChange={() => undefined}
    />,
  );
}

describe("wechat pay applyment OCR form registration", () => {
  test("keeps identity address optional for an individual subject", () => {
    const markup = renderRecognizedFields(
      "LEGAL",
      "SUBJECT_TYPE_INDIVIDUAL",
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

  test("registers every SUPER OCR field exactly once in the inline workspace", () => {
    const recognizedMarkup = renderRecognizedFields("SUPER");
    const legacyMarkup = renderLegacySteps("SUPER");
    const recognized = registeredNames(recognizedMarkup);
    const legacy = registeredNames(legacyMarkup);
    const serialized = new FormData();

    for (const name of [...recognized, ...legacy]) {
      if (SUPER_OCR_FIELD_NAMES.includes(
        name as (typeof SUPER_OCR_FIELD_NAMES)[number],
      )) {
        serialized.append(name, `${name}-value`);
      }
    }

    for (const name of SUPER_OCR_FIELD_NAMES) {
      expect(count(recognized, name)).toBe(1);
      expect(count(legacy, name)).toBe(0);
      expect(serialized.getAll(name)).toEqual([`${name}-value`]);
    }
    expect(recognizedMarkup.match(/aria-label="识别字段核对"/g)).toHaveLength(6);
  });

  test("registers LEGAL super administrator name with native validation", () => {
    const recognizedMarkup = renderRecognizedFields("LEGAL");
    const legacyMarkup = renderLegacySteps("LEGAL");
    const recognized = registeredNames(recognizedMarkup);
    const legacy = registeredNames(legacyMarkup);

    expect(count(recognized, "super_admin_name")).toBe(1);
    expect(count(legacy, "super_admin_name")).toBe(0);
    for (const name of [
      "license_name",
      "identity_name",
      "super_admin_name",
      "settlement_account_number",
    ]) {
      const control = recognizedMarkup.match(
        new RegExp(`<input[^>]*name="${name}"[^>]*>`),
      )?.[0];
      expect(control).toContain("required");
    }
  });
});
