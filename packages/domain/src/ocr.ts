export const OCR_SCENE_VALUES = [
  'wechat_pay_applyment',
  'expense_request',
  'merchant_material',
  'supplier_onboarding',
] as const;

export type OcrScene = (typeof OCR_SCENE_VALUES)[number];

export const OCR_DOCUMENT_TYPE_VALUES = [
  'business_license',
  'id_card_front',
  'id_card_back',
  'bank_card',
  'general_invoice',
  'vat_invoice_verify',
  'store_name',
  'store_classification',
  'document_classification',
] as const;

export type OcrDocumentType = (typeof OCR_DOCUMENT_TYPE_VALUES)[number];

export const OCR_TENANT_POLICY_DOCUMENT_TYPE_VALUES = [
  'business_license',
  'id_card_front',
  'id_card_back',
  'bank_card',
] as const satisfies readonly OcrDocumentType[];

export type OcrTenantPolicyDocumentType =
  (typeof OCR_TENANT_POLICY_DOCUMENT_TYPE_VALUES)[number];

export interface OcrTenantPolicy {
  readonly tenant_id: string;
  readonly enabled: boolean;
  readonly allowed_document_types: readonly OcrTenantPolicyDocumentType[];
  readonly daily_limit: number | null;
  readonly remark: string | null;
  readonly enabled_at: string | null;
  readonly updated_by_employee_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export const OCR_RECOGNITION_STATUS_VALUES = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'expired',
] as const;

export type OcrRecognitionStatus =
  (typeof OCR_RECOGNITION_STATUS_VALUES)[number];

export const OCR_SENSITIVE_FIELD_KEYS = [
  'identity_number',
  'identity_address',
  'contact_identity_number',
  'contact_identity_address',
  'settlement_account_number',
] as const;

export type OcrSensitiveFieldKey =
  (typeof OCR_SENSITIVE_FIELD_KEYS)[number];

export type OcrFieldValue = string | number | boolean | null;
export type OcrWarningLevel = 'info' | 'warning' | 'error';
export type OcrRecognitionMode = 'sync' | 'async';

export interface OcrFieldSuggestion {
  readonly key: string;
  readonly label: string;
  readonly value: OcrFieldValue;
  readonly normalized: boolean;
  readonly sensitive: boolean;
  readonly confidence: number | null;
}

export interface OcrWarning {
  readonly code: string;
  readonly level: OcrWarningLevel;
  readonly message: string;
}

export interface OcrCapability {
  readonly scene: OcrScene;
  readonly document_type: OcrDocumentType;
  readonly label: string;
  readonly attachment_categories: readonly string[];
  readonly supported_mime_types: readonly string[];
  readonly max_size_bytes: number;
  readonly mode: OcrRecognitionMode;
  readonly output_fields: readonly string[];
}

export interface OcrRecognitionView {
  readonly id: string;
  readonly status: OcrRecognitionStatus;
  readonly scene: OcrScene;
  readonly document_type: OcrDocumentType;
  readonly file_object_id: string;
  readonly provider_request_id: string | null;
  readonly expires_at: string;
  readonly fields: readonly OcrFieldSuggestion[];
  readonly warnings: readonly OcrWarning[];
}
