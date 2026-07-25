import { describe, expect, mock, test } from "bun:test";
import {
  Children,
  createElement,
  type ComponentProps,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FinanceWechatPayApplymentDocumentSection,
  LEGAL_REPRESENTATIVE_ID_CARD_DOCUMENT_SECTION_CONFIG,
} from "./finance-wechat-pay-applyment-document-section";
import {
  getOcrComparisonValues,
  getStoredFieldSources,
} from "./finance-wechat-pay-applyment-recognized-fields";
import {
  FinanceWechatPayApplymentSinglePage,
  type FinanceWechatPayApplymentSinglePageProps,
} from "./finance-wechat-pay-applyment-single-page";
import {
  buildWechatPayApplymentSubjectTypeOverrides,
} from "./finance-wechat-pay-applyment-subject-type";
import type {
  ApplymentAttachmentController,
} from "./finance-wechat-pay-applyment-attachment-controller";
import type {
  ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import type {
  WechatPayApplymentAttachment,
  WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";
import {
  FinanceWechatPayApplymentSettlementFields,
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

const manualEntryActions: Array<() => void> = [];

mock.module("@/components/ui/button", () => ({
  Button({
    children,
    onClick,
    variant: _variant,
    size: _size,
    asChild: _asChild,
    ...props
  }: ComponentProps<"button"> & {
    variant?: string;
    size?: string;
    asChild?: boolean;
  }) {
    const label = Children.toArray(children)
      .filter((child): child is string => typeof child === "string")
      .join("");
    if (label.includes("手动填写") && onClick) {
      manualEntryActions.push(() =>
        onClick({} as Parameters<NonNullable<typeof onClick>>[0])
      );
    }
    return createElement("button", props, children);
  },
}));

function registeredNames(markup: string) {
  return Array.from(
    markup.matchAll(/\sname="([^"]+)"/g),
    (match) => match[1],
  );
}

function count(values: readonly string[], target: string) {
  return values.filter((value) => value === target).length;
}

function hiddenValue(markup: string, name: string) {
  return markup.match(
    new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"[^>]*>`),
  )?.[1];
}

type SinglePageOptions = {
  applyment?: WechatPayApplymentRecord | null;
  contactType?: "LEGAL" | "SUPER";
  subjectType?: string;
  disabled?: boolean;
};

function buildSinglePageProps(
  options: SinglePageOptions,
): FinanceWechatPayApplymentSinglePageProps {
  const applyment = options.applyment ?? null;
  const contactType = options.contactType ?? "LEGAL";
  const subjectType = options.subjectType ?? "SUBJECT_TYPE_ENTERPRISE";
  const disabled = options.disabled ?? false;
  const values = {};
  return {
    applyment,
    subjectType,
    contactType,
    reviewConfirmed: false,
    readinessBlockers: [],
    pending: false,
    editable: !disabled,
    canSubmit: true,
    saving: false,
    materials: {
      attachments: [],
      materialStates: {},
      attachmentSaveErrors: {},
      supportedOcrDocumentTypes: new Set<string>(),
      recognitionConsent: true,
      capabilitiesUnavailable: false,
      pending: false,
      setRecognitionConsent: () => undefined,
      onUploaded: async () => undefined,
      onRetrySave: async () => undefined,
      onRetryRecognition: async () => undefined,
    },
    ocrReview: {
      currentValues: values,
      comparisonValues: getOcrComparisonValues(applyment, values),
      fieldSources: getStoredFieldSources(applyment, values),
      useManualEntry: async () => undefined,
    },
    onSubjectTypeChange: () => undefined,
    onContactTypeChange: () => undefined,
    onAttachmentsChange: async () => undefined,
    onApplyRecognition: () => undefined,
    onManualFieldChange: () => undefined,
    onSupplementDataChange: () => undefined,
    onReviewConfirmedChange: () => undefined,
    onSubmitApplyment: () => undefined,
  };
}

function renderSinglePage(options: SinglePageOptions = {}) {
  return renderToStaticMarkup(
    createElement(
      FinanceWechatPayApplymentSinglePage,
      buildSinglePageProps(options),
    ),
  );
}

describe("wechat pay applyment OCR form registration", () => {
  for (
    const [previousSubjectType, nextSubjectType] of [
      ["SUBJECT_TYPE_ENTERPRISE", "SUBJECT_TYPE_INDIVIDUAL"],
      ["SUBJECT_TYPE_INDIVIDUAL", "SUBJECT_TYPE_ENTERPRISE"],
    ] as const
  ) {
    test(`keeps ${previousSubjectType} -> ${nextSubjectType} UI defaults aligned with autosave overrides`, () => {
      const previousDefaults = buildWechatPayApplymentSubjectTypeOverrides(
        previousSubjectType,
      );
      const nextDefaults = buildWechatPayApplymentSubjectTypeOverrides(
        nextSubjectType,
      );
      const markup = renderToStaticMarkup(
        createElement(FinanceWechatPayApplymentSettlementFields, {
          applyment: {
            subject_type: previousSubjectType,
            settlement_account_type:
              previousDefaults.settlement_account_type,
            settlement_id: previousDefaults.settlement_id,
            qualification_type: previousDefaults.qualification_type,
          } as WechatPayApplymentRecord,
          subjectType: nextSubjectType,
          disabled: false,
          onDataChange: () => undefined,
        }),
      );

      for (const [name, value] of Object.entries(nextDefaults)) {
        if (name === "subject_type") continue;
        expect(markup).toContain(`name="${name}"`);
        expect(markup).toContain(`value="${value}"`);
      }
    });
  }

  test("forces a persisted enterprise personal account to corporate in the form", () => {
    const markup = renderToStaticMarkup(
      createElement(FinanceWechatPayApplymentSettlementFields, {
        applyment: {
          subject_type: "SUBJECT_TYPE_ENTERPRISE",
          settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
        } as WechatPayApplymentRecord,
        subjectType: "SUBJECT_TYPE_ENTERPRISE",
        disabled: true,
        onDataChange: () => undefined,
      }),
    );

    expect(hiddenValue(markup, "settlement_account_type")).toBe(
      "BANK_ACCOUNT_TYPE_CORPORATE",
    );
  });

  test("preserves a valid persisted individual account type in the form", () => {
    const markup = renderToStaticMarkup(
      createElement(FinanceWechatPayApplymentSettlementFields, {
        applyment: {
          subject_type: "SUBJECT_TYPE_INDIVIDUAL",
          settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
        } as WechatPayApplymentRecord,
        subjectType: "SUBJECT_TYPE_INDIVIDUAL",
        disabled: false,
        onDataChange: () => undefined,
      }),
    );

    expect(hiddenValue(markup, "settlement_account_type")).toBe(
      "BANK_ACCOUNT_TYPE_CORPORATE",
    );
  });

  for (const status of ["failed", "review_required"] as const) {
    test(`routes the single ${status} manual entry action through the OCR controller`, () => {
      const category = "legal_representative_id_card_front";
      const attachment: WechatPayApplymentAttachment = {
        category,
        file_object_id: "file-front",
        object_key: "legal-front",
        file_name: "legal-front.jpg",
        content_type: "image/jpeg",
        size: 1024,
        ocr_review_status: status,
      };
      const materialStates: ApplymentMaterialStateMap = {
        [category]: {
          status,
          attachmentObjectKey: attachment.object_key,
          recognitionId: "recognition-front",
          fields: [],
          warnings: [],
          error: status === "failed" ? "证照识别失败" : null,
        },
      };
      const onUseManualEntry = mock(() => undefined);
      const attachmentController = {
        attachments: [attachment],
        editable: true,
        materialStates,
        attachmentSaveErrors: {},
        supportedOcrDocumentTypes: new Set(["id_card_front"]),
        onRetrySave: () => undefined,
        onRetryRecognition: () => undefined,
        busy: false,
        uploadingCategory: null,
        error: "",
        errorCategory: null,
        openAttachmentPicker: () => undefined,
        uploadAttachment: () => undefined,
        removeAttachment: () => undefined,
      } satisfies ApplymentAttachmentController;
      manualEntryActions.length = 0;
      const markup = renderToStaticMarkup(
        createElement(FinanceWechatPayApplymentDocumentSection, {
          ...LEGAL_REPRESENTATIVE_ID_CARD_DOCUMENT_SECTION_CONFIG,
          attachmentController,
          ocrController: {
            attachments: [attachment],
            materialStates,
            contactType: "LEGAL",
            subjectType: "SUBJECT_TYPE_ENTERPRISE",
            values: {},
            comparisonValues: {},
            fieldSources: {},
            onManualChange: () => undefined,
            onApply: () => undefined,
            onUseManualEntry,
          },
        }),
      );
      const labelledBy = Array.from(
        markup.matchAll(/aria-labelledby="([^"]+)"/g),
        (match) => match[1],
      );

      expect(markup.match(/改为手动填写/g)).toHaveLength(1);
      expect(manualEntryActions).toHaveLength(1);
      manualEntryActions[0]?.();
      expect(onUseManualEntry).toHaveBeenCalledTimes(1);
      expect(onUseManualEntry).toHaveBeenCalledWith(category);
      expect(labelledBy).toHaveLength(2);
      expect(new Set(labelledBy).size).toBe(2);
      for (const id of labelledBy) expect(markup).toContain(`id="${id}"`);
    });
  }

  test("registers every SUPER control once through the real single page", () => {
    const names = registeredNames(renderSinglePage({
      contactType: "SUPER",
    }));

    for (const name of SINGLE_PAGE_FIELD_NAMES) {
      expect(count(names, name)).toBe(1);
    }
  });

  test("renders nested material targets as labelled level-three sections", () => {
    const markup = renderSinglePage();

    for (const targetId of ["settlement-materials", "business-materials"]) {
      const section = markup.match(
        new RegExp(
          `<section[^>]*id="${targetId}"[^>]*aria-labelledby="${targetId}-heading"[^>]*>`,
        ),
      )?.[0];
      expect(section).toContain('tabindex="-1"');
      expect(markup).toContain(
        `<h3 id="${targetId}-heading"`,
      );
    }
  });

  test("keeps identity address optional for an individual subject", () => {
    const markup = renderSinglePage({
      contactType: "LEGAL",
      subjectType: "SUBJECT_TYPE_INDIVIDUAL",
    });
    const control = markup.match(
      /<input[^>]*name="identity_address"[^>]*>/,
    )?.[0];

    expect(control).toBeDefined();
    expect(control).not.toContain("required");
  });

  test(
    "keeps legal identity fields required for an enterprise subject",
    () => {
      const markup = renderSinglePage({ contactType: "LEGAL" });

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
    },
  );

  test(
    "keeps bank account required unless its own masked value exists",
    () => {
      const identityOnly = {
        has_sensitive_payload: true,
        settlement_account_number_masked: null,
      } as WechatPayApplymentRecord;
      const withBankAccount = {
        ...identityOnly,
        settlement_account_number_masked: "6222••••8888",
      };
      const requiredMarkup = renderSinglePage({
        applyment: identityOnly,
      });
      const storedMarkup = renderSinglePage({
        applyment: withBankAccount,
      });
      const requiredControl = requiredMarkup.match(
        /<input[^>]*name="settlement_account_number"[^>]*>/,
      )?.[0];
      const storedControl = storedMarkup.match(
        /<input[^>]*name="settlement_account_number"[^>]*>/,
      )?.[0];

      expect(getStoredFieldSources(identityOnly, {})).toMatchObject({
        identity_name: "stored",
      });
      expect(getStoredFieldSources(identityOnly, {}))
        .not.toHaveProperty("settlement_account_number");
      expect(getStoredFieldSources(withBankAccount, {}))
        .toHaveProperty("settlement_account_number", "stored");
      expect(getOcrComparisonValues(withBankAccount, {}))
        .toHaveProperty("settlement_account_number", "已安全保存");
      expect(requiredControl).toContain("required");
      expect(storedControl).toBeDefined();
      expect(storedControl).not.toContain("required");
    },
  );

  test("registers required OCR and supplement controls natively", () => {
    const markup = renderSinglePage({ contactType: "SUPER" });

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

  test(
    "keeps registered fields visible when the single-page form is read-only",
    () => {
      const markup = renderSinglePage({
        contactType: "SUPER",
        disabled: true,
      });

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
    },
  );
});
