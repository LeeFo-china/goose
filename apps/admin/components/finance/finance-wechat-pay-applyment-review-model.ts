import type { ApplymentStageKey } from "./finance-wechat-pay-applyment-flow-model";
import { buildWechatPayApplymentPayload } from "./finance-wechat-pay-applyment-schema";
import {
  getWechatPayApplymentAttachmentCategoryLabel,
  type WechatPayApplymentAttachment,
  type WechatPayApplymentAttachmentCategory,
  type WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";

export type WechatPayApplymentReviewSnapshot = {
  subject: string;
  contact: string;
  settlement: string;
  attachments: string;
};

export type WechatPayApplymentReviewTarget = {
  stage: ApplymentStageKey;
  ocrCategory?: WechatPayApplymentAttachmentCategory;
};

type ReviewFallback = Partial<WechatPayApplymentRecord>;

export function buildWechatPayApplymentSubmissionData(
  form: FormData,
  options: {
    applyment: ReviewFallback | null;
    hasSensitivePayload: boolean;
    attachments: WechatPayApplymentAttachment[];
  },
) {
  const payload = buildWechatPayApplymentPayload(form, {
    hasSensitivePayload: options.hasSensitivePayload,
    attachments: options.attachments,
  });
  return {
    payload,
    review: buildReviewSnapshot(payload, options.applyment),
  };
}

export function buildWechatPayApplymentStoredReview(
  applyment: WechatPayApplymentRecord | null,
  attachments: WechatPayApplymentAttachment[],
): WechatPayApplymentReviewSnapshot {
  if (!applyment) {
    return buildReviewSnapshot({ attachments }, null);
  }
  return buildReviewSnapshot({
    subject_type: applyment.subject_type,
    license_name: applyment.license_name,
    license_code: applyment.license_code,
    legal_representative_name: applyment.legal_representative_name,
    contact_type: applyment.contact_type,
    super_admin_name: applyment.super_admin_name,
    super_admin_email: applyment.super_admin_email,
    merchant_short_name: applyment.merchant_short_name,
    settlement_account_name: applyment.settlement_account_name,
    settlement_bank_name: applyment.settlement_bank_name,
    settlement_bank_full_name: applyment.settlement_bank_full_name,
    attachments,
  }, applyment);
}

export function getWechatPayApplymentReviewTargets(
  contactType: string,
): Record<keyof WechatPayApplymentReviewSnapshot, WechatPayApplymentReviewTarget> {
  return {
    subject: { stage: "recognition", ocrCategory: "license_copy" },
    contact: {
      stage: "recognition",
      ocrCategory: contactType === "SUPER"
        ? "contact_id_card_front"
        : "legal_representative_id_card_front",
    },
    settlement: { stage: "supplement" },
    attachments: { stage: "materials" },
  };
}

function buildReviewSnapshot(
  payload: Record<string, unknown>,
  fallback: ReviewFallback | null,
): WechatPayApplymentReviewSnapshot {
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments as WechatPayApplymentAttachment[]
    : [];
  const attachmentLabels = attachments.map((attachment) =>
    getWechatPayApplymentAttachmentCategoryLabel(attachment.category)
  );
  const identityName = value(payload, "identity_name");
  const identityNumber = value(payload, "identity_number");
  const identityAddress = value(payload, "identity_address");
  const contactIdentityNumber = value(payload, "contact_identity_number");
  const contactIdentityAddress = value(payload, "contact_identity_address");
  const phone = value(payload, "super_admin_phone");
  const accountNumber = value(payload, "settlement_account_number");

  return {
    subject: [
      value(payload, "subject_type") === "SUBJECT_TYPE_ENTERPRISE"
        ? "企业"
        : "个体工商户",
      display(payload, "license_name", "营业执照信息待填写"),
      display(payload, "license_code", "信用代码待填写"),
      identityName
        ? maskPersonalName(identityName)
        : fallback?.has_sensitive_payload
          ? "法人证件姓名已安全保存"
          : "法人证件姓名待填写",
      identityNumber
        ? maskIdentityNumber(identityNumber)
        : fallback?.has_sensitive_payload
          ? "法人证件号码已安全保存"
          : "法人证件号码待填写",
      identityAddress
        ? maskAddress(identityAddress)
        : fallback?.identity_address_masked,
    ].filter(Boolean).join(" · "),
    contact: [
      display(payload, "legal_representative_name", "法人信息待填写"),
      value(payload, "contact_type") === "SUPER" ? "经办人" : "法人本人",
      display(payload, "super_admin_name", "管理员信息待填写"),
      phone
        ? maskPhone(phone)
        : fallback?.super_admin_phone_masked || "管理员手机号待填写",
      display(payload, "super_admin_email", "管理员邮箱待填写"),
      contactIdentityNumber
        ? maskIdentityNumber(contactIdentityNumber)
        : null,
      contactIdentityAddress ? maskAddress(contactIdentityAddress) : null,
    ].filter(Boolean).join(" · "),
    settlement: [
      display(payload, "merchant_short_name", "商户简称待填写"),
      display(payload, "settlement_account_name", "结算账户待填写"),
      displayBankName(payload),
      accountNumber
        ? maskAccountNumber(accountNumber)
        : fallback?.settlement_account_number_masked || "结算账号待填写",
    ].join(" · "),
    attachments: attachmentLabels.length > 0
      ? attachmentLabels.join("、")
      : "暂未上传申请附件",
  };
}

function display(
  payload: Record<string, unknown>,
  key: string,
  emptyLabel: string,
) {
  return value(payload, key) || emptyLabel;
}

function displayBankName(payload: Record<string, unknown>) {
  return value(payload, "settlement_bank_name") ||
    value(payload, "settlement_bank_full_name") ||
    "开户银行待填写";
}

function value(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === "string" ? payload[key].trim() : "";
}

function maskPhone(value: string) {
  return value.length >= 7
    ? `${value.slice(0, 3)}****${value.slice(-4)}`
    : "手机号已填写";
}

function maskPersonalName(value: string) {
  return value.length > 1 ? `${value.slice(0, 1)}**` : "姓名已填写";
}

function maskIdentityNumber(value: string) {
  return value.length >= 10
    ? `${value.slice(0, 6)}********${value.slice(-4)}`
    : "证件号码已填写";
}

function maskAccountNumber(value: string) {
  return value.length >= 8
    ? `${value.slice(0, 4)}••••${value.slice(-4)}`
    : "结算账号已填写";
}

function maskAddress(value: string) {
  return value.length > 6 ? `${value.slice(0, 6)}••••` : "证件地址已填写";
}
