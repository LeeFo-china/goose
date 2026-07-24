export const mockTenantId = "22222222-2222-4222-8222-222222222222";
export const mockApplymentId = "33333333-3333-4333-8333-333333333333";

const now = "2026-07-23T10:30:00+08:00";
const MAX_MEDIA_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/bmp"]);
const REQUIRED_CATEGORIES = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
];
const KNOWN_CATEGORIES = new Set([
  ...REQUIRED_CATEGORIES,
  "contact_id_card_front",
  "contact_id_card_back",
  "settlement_account_proof",
  "business_scene_material",
]);
const SINGLETON_CATEGORIES = new Set([
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
  "contact_id_card_front",
  "contact_id_card_back",
  "settlement_account_proof",
]);
const DOCUMENT_TYPE_BY_CATEGORY = {
  license_copy: "business_license",
  legal_representative_id_card_front: "id_card_front",
  legal_representative_id_card_back: "id_card_back",
  contact_id_card_front: "id_card_front",
  contact_id_card_back: "id_card_back",
  settlement_account_proof: "bank_card",
};
const attachmentCategories = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
  "settlement_account_proof",
];

export const mockAttachments = attachmentCategories.map((category, index) => ({
  category,
  file_object_id: `00000000-0000-4000-8000-00000000000${index}`,
  object_key:
    `tenants/${mockTenantId}/wechat-pay-applyment/unassigned/2026/07/23/`
    + `20000000-0000-4000-8000-00000000000${index}.png`,
  file_name: `${category}.png`,
  content_type: "image/png",
  size: 68,
  ocr_recognition_id: `10000000-0000-4000-8000-00000000000${index}`,
  ocr_review_status: "confirmed",
}));

export const mockOcrRecognitions = mockAttachments.map((attachment) => ({
  id: attachment.ocr_recognition_id,
  tenant_id: mockTenantId,
  scene: "wechat_pay_applyment",
  document_type: DOCUMENT_TYPE_BY_CATEGORY[attachment.category],
  file_object_id: attachment.file_object_id,
  subject_type: "wechat_pay_applyment",
  subject_id: mockApplymentId,
  status: "succeeded",
}));

export const initialApplyment = {
  id: mockApplymentId,
  tenant_id: mockTenantId,
  application_no: "WPA202607230001",
  status: "draft",
  subject_type: "SUBJECT_TYPE_ENTERPRISE",
  merchant_short_name: "复核测试简称",
  license_name: "复核测试商户有限公司",
  license_code: "91410000TEST000001",
  license_address: "测试注册地址",
  license_period_begin: "2020-01-01",
  license_period_end: "长期",
  legal_representative_name: "测试法人",
  identity_doc_type: "IDENTIFICATION_TYPE_IDCARD",
  identity_address_masked: "测试省测试市••••",
  identity_period_begin: "2020-01-01",
  identity_period_end: "长期",
  contact_type: "LEGAL",
  super_admin_name: "测试法人",
  super_admin_phone_masked: "138****1234",
  super_admin_email: "admin@example.com",
  contact_identity_doc_type: null,
  contact_identity_period_begin: null,
  contact_identity_period_end: null,
  service_phone: "4008001234",
  settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
  settlement_account_name: "复核测试商户有限公司",
  settlement_account_number_masked: "6222••••1234",
  settlement_bank_name: "测试银行",
  settlement_bank_full_name: "测试银行营业部",
  settlement_bank_branch_id: "123456789012",
  settlement_account_summary: "测试银行营业部 6222••••1234",
  settlement_id: "716",
  qualification_type: "零售批发/生活娱乐/网上商城/其他",
  business_scene_description: "线下家装服务",
  contact_address: "测试市测试区一号",
  attachments: mockAttachments,
  remark: "待提交复核",
  has_sensitive_payload: true,
  sensitive_payload_version: 1,
  sensitive_payload_updated_at: now,
  rejected_reason: null,
  sub_mchid: null,
  draft_epoch: 1,
  draft_revision: 10,
  created_at: now,
  updated_at: now,
};

export function getMockAttachmentReadinessBlockers(
  applyment,
  recognitions = mockOcrRecognitions,
) {
  const blockers = [];
  const seenCategories = new Set();
  const recognitionById = new Map(
    recognitions.map((recognition) => [recognition.id, recognition]),
  );
  const attachments = Array.isArray(applyment.attachments)
    ? applyment.attachments
    : [];
  for (const category of REQUIRED_CATEGORIES) {
    if (!attachments.some((attachment) => attachment?.category === category)) {
      blockers.push({ code: "APPLYMENT_REQUIRED_ATTACHMENT_MISSING", category });
    }
  }
  for (const attachment of attachments) {
    if (
      !attachment ||
      typeof attachment !== "object" ||
      Array.isArray(attachment)
    ) {
      blockers.push({ code: "APPLYMENT_MEDIA_METADATA_INVALID" });
      continue;
    }
    const category = attachment.category;
    if (typeof category !== "string" || !KNOWN_CATEGORIES.has(category)) {
      blockers.push({ code: "APPLYMENT_MEDIA_CATEGORY_INVALID" });
      continue;
    }
    if (SINGLETON_CATEGORIES.has(category) && seenCategories.has(category)) {
      blockers.push({ code: "APPLYMENT_MEDIA_CATEGORY_DUPLICATE", category });
    }
    seenCategories.add(category);
    if (!isOwnedObjectKey(attachment.object_key, applyment.tenant_id)) {
      blockers.push({ code: "APPLYMENT_OBJECT_KEY_INVALID", category });
    }
    if (!ALLOWED_MEDIA_TYPES.has(attachment.content_type)) {
      blockers.push({ code: "APPLYMENT_MEDIA_TYPE_UNSUPPORTED", category });
    }
    if (!Number.isSafeInteger(attachment.size) || attachment.size <= 0) {
      blockers.push({ code: "APPLYMENT_MEDIA_SIZE_INVALID", category });
    } else if (attachment.size > MAX_MEDIA_SIZE_BYTES) {
      blockers.push({ code: "APPLYMENT_MEDIA_TOO_LARGE", category });
    }
    const documentType = DOCUMENT_TYPE_BY_CATEGORY[category];
    if (!documentType || attachment.ocr_review_status === "manual") continue;
    if (attachment.ocr_review_status !== "confirmed") {
      blockers.push({
        code: "APPLYMENT_ATTACHMENT_OCR_REVIEW_REQUIRED",
        category,
      });
      continue;
    }
    const recognition = recognitionById.get(attachment.ocr_recognition_id);
    if (!matchesRecognition(
      recognition,
      applyment,
      attachment.file_object_id,
      documentType,
    )) {
      blockers.push({
        code: "APPLYMENT_ATTACHMENT_OCR_RECOGNITION_MISMATCH",
        category,
      });
    }
  }
  return deduplicateBlockers(blockers);
}

function isOwnedObjectKey(value, tenantId) {
  if (typeof value !== "string") return false;
  const expectedPrefix = `tenants/${tenantId}/wechat-pay-applyment/`;
  const segments = value.split("/");
  return value === value.trim() && value.startsWith(expectedPrefix) &&
    !/^https?:\/\//i.test(value) && !value.includes("\\") &&
    !segments.some((segment) => segment === "." || segment === "..");
}

function matchesRecognition(recognition, applyment, fileObjectId, documentType) {
  return recognition?.tenant_id === applyment.tenant_id &&
    recognition.scene === "wechat_pay_applyment" &&
    recognition.document_type === documentType &&
    recognition.file_object_id === fileObjectId &&
    recognition.subject_type === "wechat_pay_applyment" &&
    recognition.subject_id === applyment.id &&
    recognition.status === "succeeded";
}

function deduplicateBlockers(blockers) {
  const seen = new Set();
  return blockers.filter((blocker) => {
    const key = JSON.stringify(blocker);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
