"use client";

import { FieldGroup } from "@/components/ui/field";
import {
  type ApplymentFieldSource,
  PeriodEndField,
  TextField,
} from "./finance-wechat-pay-applyment-form-fields";
import type {
  WechatPayApplymentAttachmentCategory,
  WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";

export const APPLYMENT_OCR_REVIEW_CATEGORIES = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
  "contact_id_card_front",
  "contact_id_card_back",
  "settlement_account_proof",
] as const satisfies readonly WechatPayApplymentAttachmentCategory[];

const SENSITIVE_OCR_FIELD_KEYS = [
  "identity_name",
  "identity_number",
  "identity_address",
  "contact_identity_number",
  "contact_identity_address",
] as const;

export function getStoredOcrValues(
  applyment: WechatPayApplymentRecord | null,
): Record<string, string> {
  return {
    license_name: applyment?.license_name ?? "",
    license_code: applyment?.license_code ?? "",
    license_address: applyment?.license_address ?? "",
    license_period_begin: applyment?.license_period_begin ?? "",
    license_period_end: applyment?.license_period_end ?? "",
    legal_representative_name: applyment?.legal_representative_name ?? "",
    identity_period_begin: applyment?.identity_period_begin ?? "",
    identity_period_end: applyment?.identity_period_end ?? "",
    super_admin_name: applyment?.super_admin_name ?? "",
    contact_identity_period_begin:
      applyment?.contact_identity_period_begin ?? "",
    contact_identity_period_end: applyment?.contact_identity_period_end ?? "",
    settlement_bank_name: applyment?.settlement_bank_name ?? "",
  };
}

export function getStoredFieldSources(
  applyment: WechatPayApplymentRecord | null,
  values: Readonly<Record<string, string>>,
): Record<string, ApplymentFieldSource> {
  const sources: Record<string, ApplymentFieldSource> = Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => [key, "tenant" as const]),
  );
  if (applyment?.has_sensitive_payload) {
    for (const key of SENSITIVE_OCR_FIELD_KEYS) sources[key] = "stored";
  }
  if (applyment?.settlement_account_number_masked) {
    sources.settlement_account_number = "stored";
  }
  return sources;
}

export function getOcrComparisonValues(
  applyment: WechatPayApplymentRecord | null,
  values: Readonly<Record<string, string>>,
) {
  const comparisons = { ...values };
  if (applyment?.has_sensitive_payload) {
    for (const key of SENSITIVE_OCR_FIELD_KEYS) {
      if (!comparisons[key]) comparisons[key] = "已安全保存";
    }
  }
  if (
    applyment?.settlement_account_number_masked &&
    !comparisons.settlement_account_number
  ) {
    comparisons.settlement_account_number = "已安全保存";
  }
  return comparisons;
}

type RecognizedFieldDefinition = {
  key: string;
  label: string;
  type?: "date";
  periodEnd?: boolean;
  sensitive?: boolean;
  required?: boolean;
};

const SUPER_ADMIN_NAME_FIELD = {
  key: "super_admin_name",
  label: "超级管理员姓名",
  required: true,
} as const satisfies RecognizedFieldDefinition;

const RECOGNIZED_FIELDS: Record<
  (typeof APPLYMENT_OCR_REVIEW_CATEGORIES)[number],
  readonly RecognizedFieldDefinition[]
> = {
  license_copy: [
    { key: "license_name", label: "营业执照主体名称", required: true },
    { key: "license_code", label: "统一社会信用代码", required: true },
    { key: "license_address", label: "营业执照注册地址" },
    { key: "license_period_begin", label: "营业执照有效期开始", type: "date" },
    { key: "license_period_end", label: "营业执照有效期结束", periodEnd: true },
    { key: "legal_representative_name", label: "法人姓名", required: true },
  ],
  legal_representative_id_card_front: [
    { key: "identity_name", label: "身份证姓名", sensitive: true, required: true },
    {
      key: "identity_number",
      label: "身份证号码",
      sensitive: true,
      required: true,
    },
    {
      key: "identity_address",
      label: "身份证居住地址",
      sensitive: true,
      required: true,
    },
  ],
  legal_representative_id_card_back: [
    {
      key: "identity_period_begin",
      label: "身份证有效期开始",
      type: "date",
      required: true,
    },
    {
      key: "identity_period_end",
      label: "身份证有效期结束",
      periodEnd: true,
      required: true,
    },
  ],
  contact_id_card_front: [
    SUPER_ADMIN_NAME_FIELD,
    {
      key: "contact_identity_number",
      label: "经办人身份证号码",
      sensitive: true,
      required: true,
    },
    {
      key: "contact_identity_address",
      label: "经办人身份证地址",
      sensitive: true,
      required: true,
    },
  ],
  contact_id_card_back: [
    {
      key: "contact_identity_period_begin",
      label: "经办人证件有效期开始",
      type: "date",
      required: true,
    },
    {
      key: "contact_identity_period_end",
      label: "经办人证件有效期结束",
      periodEnd: true,
      required: true,
    },
  ],
  settlement_account_proof: [
    {
      key: "settlement_account_number",
      label: "银行账号",
      sensitive: true,
      required: true,
    },
    { key: "settlement_bank_name", label: "开户银行", required: true },
  ],
};

function getRecognizedFields(
  category: (typeof APPLYMENT_OCR_REVIEW_CATEGORIES)[number],
  contactType: string,
) {
  if (contactType !== "SUPER" && category.startsWith("contact_id_card_")) {
    return [];
  }
  if (
    contactType === "LEGAL" &&
    category === "legal_representative_id_card_front"
  ) {
    return [...RECOGNIZED_FIELDS[category], SUPER_ADMIN_NAME_FIELD];
  }
  return RECOGNIZED_FIELDS[category];
}

export function FinanceWechatPayApplymentRecognizedFields({
  selectedCategory,
  contactType,
  subjectType,
  values,
  fieldSources,
  disabled,
  onManualChange,
}: {
  selectedCategory: WechatPayApplymentAttachmentCategory;
  contactType: string;
  subjectType: string;
  values: Readonly<Record<string, string>>;
  fieldSources: Readonly<Record<string, ApplymentFieldSource>>;
  disabled?: boolean;
  onManualChange: (key: string, value: string) => void;
}) {
  return (
    <div className="min-w-0">
      {APPLYMENT_OCR_REVIEW_CATEGORIES.map((category) => (
        <section
          key={category}
          hidden={selectedCategory !== category}
          aria-label="识别字段核对"
          data-ocr-category={category}
        >
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {getRecognizedFields(category, contactType)
              .map((field) => (
                <RecognizedField
                  key={field.key}
                  field={field}
                  required={Boolean(
                    field.required &&
                    (
                      field.key !== "identity_address" ||
                      subjectType === "SUBJECT_TYPE_ENTERPRISE"
                    ),
                  )}
                  value={values[field.key] ?? ""}
                  source={fieldSources[field.key]}
                  disabled={disabled}
                  onValueChange={(value) => onManualChange(field.key, value)}
                />
              ))}
          </FieldGroup>
        </section>
      ))}
    </div>
  );
}

function RecognizedField({
  field,
  required,
  value,
  source,
  disabled,
  onValueChange,
}: {
  field: RecognizedFieldDefinition;
  required: boolean;
  value: string;
  source?: ApplymentFieldSource;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  const shared = {
    label: field.label,
    name: field.key,
    defaultValue: value,
    appliedValue: value,
    requirement: required ? "required" as const : "optional" as const,
    disabled,
    source,
    idPrefix: "wechat-pay-ocr-review",
    onValueChange,
  };
  if (field.periodEnd) return <PeriodEndField {...shared} />;
  return (
    <TextField
      {...shared}
      required={required && source !== "stored"}
      type={field.type}
      placeholder={
        field.sensitive && source === "stored"
          ? "已安全保存，修改将替换原值"
          : undefined
      }
      stored={field.sensitive && source === "stored"}
    />
  );
}
