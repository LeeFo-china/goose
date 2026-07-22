import type {
  OcrCapability,
  OcrDocumentType,
  OcrScene,
} from "@gooes/domain";

export type OcrProviderAction =
  | "BizLicenseOCR"
  | "RecognizeEncryptedIDCardOCR"
  | "BankCardOCR";

export type OcrCapabilityDefinition = OcrCapability & {
  readonly providerAction: OcrProviderAction;
  readonly concurrencyLimit: number;
  readonly cardSide?: "FRONT" | "BACK";
};

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png"] as const;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const CAPABILITIES: readonly OcrCapabilityDefinition[] = [
  {
    scene: "wechat_pay_applyment",
    document_type: "business_license",
    label: "营业执照识别",
    attachment_categories: ["license_copy"],
    supported_mime_types: IMAGE_MIME_TYPES,
    max_size_bytes: MAX_IMAGE_SIZE_BYTES,
    mode: "sync",
    output_fields: [
      "license_name",
      "license_code",
      "license_address",
      "license_period_begin",
      "license_period_end",
      "legal_representative_name",
    ],
    providerAction: "BizLicenseOCR",
    concurrencyLimit: 8,
  },
  {
    scene: "wechat_pay_applyment",
    document_type: "id_card_front",
    label: "身份证人像面识别",
    attachment_categories: [
      "legal_representative_id_card_front",
      "contact_id_card_front",
    ],
    supported_mime_types: IMAGE_MIME_TYPES,
    max_size_bytes: MAX_IMAGE_SIZE_BYTES,
    mode: "sync",
    output_fields: ["identity_name", "identity_number", "identity_address"],
    providerAction: "RecognizeEncryptedIDCardOCR",
    concurrencyLimit: 16,
    cardSide: "FRONT",
  },
  {
    scene: "wechat_pay_applyment",
    document_type: "id_card_back",
    label: "身份证国徽面识别",
    attachment_categories: [
      "legal_representative_id_card_back",
      "contact_id_card_back",
    ],
    supported_mime_types: IMAGE_MIME_TYPES,
    max_size_bytes: MAX_IMAGE_SIZE_BYTES,
    mode: "sync",
    output_fields: [
      "identity_authority",
      "identity_period_begin",
      "identity_period_end",
    ],
    providerAction: "RecognizeEncryptedIDCardOCR",
    concurrencyLimit: 16,
    cardSide: "BACK",
  },
  {
    scene: "wechat_pay_applyment",
    document_type: "bank_card",
    label: "结算银行卡识别",
    attachment_categories: ["settlement_account_proof"],
    supported_mime_types: IMAGE_MIME_TYPES,
    max_size_bytes: MAX_IMAGE_SIZE_BYTES,
    mode: "sync",
    output_fields: [
      "settlement_account_number",
      "settlement_bank_name",
      "settlement_card_type",
    ],
    providerAction: "BankCardOCR",
    concurrencyLimit: 8,
  },
];

export function getOcrCapability(
  scene: OcrScene,
  documentType: OcrDocumentType,
): OcrCapabilityDefinition | null {
  return CAPABILITIES.find(
    (item) => item.scene === scene && item.document_type === documentType,
  ) ?? null;
}

export function listOcrCapabilityDefinitions(scene?: OcrScene) {
  return scene ? CAPABILITIES.filter((item) => item.scene === scene) : [...CAPABILITIES];
}

export function listPublicOcrCapabilities(scene?: OcrScene): OcrCapability[] {
  return listOcrCapabilityDefinitions(scene).map(({
    providerAction: _providerAction,
    concurrencyLimit: _concurrencyLimit,
    cardSide: _cardSide,
    ...publicCapability
  }) => publicCapability);
}
