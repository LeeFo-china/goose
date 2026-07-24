import type { OcrFieldSuggestion } from "@gooes/domain";
import type { IdentityCheckResult } from "./platform-supplier-onboarding-api";
import type { SupplierType } from "./platform-supplier-types";

export type SupplierBusinessLicenseFormPatch = {
  name: string;
  legalName: string;
  creditCode: string;
  legalRepresentativeName: string;
  registeredAddressText: string;
  licenseValidFrom: string;
  licenseValidUntil: string;
};

export type OnboardingFormState = {
  name: string;
  legalName: string;
  creditCode: string;
  supplierType: SupplierType;
  legalRepresentativeName: string;
  registeredAddressText: string;
  licenseFileId: string;
  ocrRecognitionId: string;
  licenseValidFrom: string;
  licenseValidUntil: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
};

export const emptySupplierOnboardingForm: OnboardingFormState = {
  name: "",
  legalName: "",
  creditCode: "",
  supplierType: "manufacturer",
  legalRepresentativeName: "",
  registeredAddressText: "",
  licenseFileId: "",
  ocrRecognitionId: "",
  licenseValidFrom: "",
  licenseValidUntil: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
};

export function normalizeCreditCode(value: string) {
  return value.trim().toUpperCase();
}

export function mapBusinessLicenseOcrFields(
  fields: readonly OcrFieldSuggestion[],
): SupplierBusinessLicenseFormPatch {
  const values = new Map(
    fields
      .filter((field) => typeof field.value === "string")
      .map((field) => [field.key, String(field.value).trim()]),
  );
  const legalName = values.get("license_name") ?? "";
  return {
    name: legalName,
    legalName,
    creditCode: normalizeCreditCode(values.get("license_code") ?? ""),
    legalRepresentativeName: values.get("legal_representative_name") ?? "",
    registeredAddressText: values.get("license_address") ?? "",
    licenseValidFrom: toDateInputValue(values.get("license_period_begin")),
    licenseValidUntil: toDateInputValue(values.get("license_period_end")),
  };
}

function toDateInputValue(value: string | undefined) {
  if (!value || value === "长期") return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function validateSupplierOnboardingForm(
  form: OnboardingFormState,
  duplicate: IdentityCheckResult | null,
) {
  const errors: Record<string, string> = {};
  if (!form.licenseFileId) errors.licenseFileId = "请先上传营业执照";
  if (!form.name.trim()) errors.name = "请填写供应商名称";
  if (!form.legalName.trim()) errors.legalName = "请填写法定名称";
  if (!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(normalizeCreditCode(form.creditCode))) {
    errors.creditCode = "请填写 18 位统一社会信用代码";
  }
  if (duplicate) errors.creditCode = "统一社会信用代码已存在";
  if (!form.contactName.trim()) errors.contactName = "请填写联系人姓名";
  if (!form.contactPhone.trim()) errors.contactPhone = "请填写联系方式";
  return errors;
}

export function buildSupplierOnboardingPayload(form: OnboardingFormState) {
  return {
    name: form.name.trim(),
    legal_name: form.legalName.trim(),
    unified_social_credit_code: normalizeCreditCode(form.creditCode),
    supplier_type: form.supplierType,
    legal_representative_name: nullableText(form.legalRepresentativeName),
    registered_address_text: nullableText(form.registeredAddressText),
    license_file_id: form.licenseFileId,
    ocr_recognition_id: nullableText(form.ocrRecognitionId),
    license_valid_from: nullableText(form.licenseValidFrom),
    license_valid_until: nullableText(form.licenseValidUntil),
    primary_contact: {
      name: form.contactName.trim(),
      phone: form.contactPhone.trim(),
      email: nullableText(form.contactEmail),
    },
  };
}

function nullableText(value: string) {
  const text = value.trim();
  return text ? text : null;
}
