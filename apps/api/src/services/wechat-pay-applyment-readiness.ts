import { Errors } from "@/errors/error-factory";
import type { WechatPayApplymentRecord } from "@/repositories/wechat-pay-applyments";
import { WechatPayApplymentAttachmentCategorySchema } from "@/schema/wechat-pay-applyments";

const BASE_ATTACHMENT_CATEGORIES = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
] as const;

export function assertApplymentSubmitReady(
  applyment: WechatPayApplymentRecord,
): void {
  const missing = [
    ["subject_type", applyment.subject_type],
    ["merchant_short_name", applyment.merchant_short_name],
    ["license_name", applyment.license_name],
    ["license_code", applyment.license_code],
    ["legal_representative_name", applyment.legal_representative_name],
    ["identity_doc_type", applyment.identity_doc_type],
    ["identity_period_begin", applyment.identity_period_begin],
    ["identity_period_end", applyment.identity_period_end],
    ["contact_type", applyment.contact_type],
    ["super_admin_name", applyment.super_admin_name],
    ["super_admin_phone_masked", applyment.super_admin_phone_masked],
    ["super_admin_email", applyment.super_admin_email],
    ["service_phone", applyment.service_phone],
    ["settlement_account_type", applyment.settlement_account_type],
    ["settlement_account_name", applyment.settlement_account_name],
    ["settlement_bank_name", applyment.settlement_bank_name],
    [
      "settlement_account_number_masked",
      applyment.settlement_account_number_masked,
    ],
    ["settlement_account_summary", applyment.settlement_account_summary],
    ["settlement_id", applyment.settlement_id],
    ["qualification_type", applyment.qualification_type],
    ["business_scene_description", applyment.business_scene_description],
    ["contact_address", applyment.contact_address],
  ]
    .filter(([, value]) => !String(value ?? "").trim())
    .map(([field]) => field);

  if (!applyment.has_sensitive_payload || !applyment.sensitive_payload_version) {
    missing.push("sensitive_payload");
  }
  if (
    applyment.subject_type === "SUBJECT_TYPE_ENTERPRISE" &&
    !applyment.identity_address_masked
  ) {
    missing.push("identity_address");
  }
  if (applyment.contact_type === "SUPER") {
    for (const [field, value] of [
      ["contact_identity_doc_type", applyment.contact_identity_doc_type],
      ["contact_identity_period_begin", applyment.contact_identity_period_begin],
      ["contact_identity_period_end", applyment.contact_identity_period_end],
    ] as const) {
      if (!String(value ?? "").trim()) missing.push(field);
    }
  }

  const categories = collectAttachmentCategories(applyment.attachments);
  const requiredCategories = [
    ...BASE_ATTACHMENT_CATEGORIES,
    ...(applyment.contact_type === "SUPER"
      ? ["contact_id_card_front", "contact_id_card_back"] as const
      : []),
  ];
  for (const category of requiredCategories) {
    if (!categories.has(category)) missing.push(`attachments.${category}`);
  }

  if (missing.length > 0) {
    throw Errors.business(
      400,
      "微信支付开通申请资料不完整",
      "WECHAT_PAY_APPLYMENT_REQUIRED_FIELDS_MISSING",
      { missing },
    );
  }
}

function collectAttachmentCategories(attachments: unknown): Set<string> {
  const categories = new Set<string>();
  if (!Array.isArray(attachments)) return categories;
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
      continue;
    }
    const category = (attachment as { category?: unknown }).category;
    const parsed = WechatPayApplymentAttachmentCategorySchema.safeParse(category);
    if (parsed.success) categories.add(parsed.data);
  }
  return categories;
}
