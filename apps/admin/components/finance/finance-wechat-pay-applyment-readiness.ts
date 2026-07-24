import {
  isWechatPayApplymentKnownBlockerCode,
  type WechatPayApplymentKnownBlockerCode,
} from "@gooes/domain";
import type { ApplymentStageKey } from "./finance-wechat-pay-applyment-flow-model";
import {
  getWechatPayApplymentAttachmentCategoryLabel,
  type WechatPayApplymentAttachmentCategory,
  type WechatPayApplymentPreflightBlocker,
  WECHAT_PAY_APPLYMENT_ATTACHMENT_CATEGORIES,
} from "./finance-wechat-pay-applyment-shared";

export const APPLYMENT_TARGET_IDS = {
  subjectType: "wechat-pay-applyment-subject_type",
  merchantShortName: "wechat-pay-applyment-merchant_short_name",
  licenseName: "wechat-pay-ocr-review-license_name",
  licenseCode: "wechat-pay-ocr-review-license_code",
  legalRepresentativeName: "wechat-pay-ocr-review-legal_representative_name",
  identityName: "wechat-pay-ocr-review-identity_name",
  identityNumber: "wechat-pay-ocr-review-identity_number",
  identityAddress: "wechat-pay-ocr-review-identity_address",
  identityPeriodBegin: "wechat-pay-ocr-review-identity_period_begin",
  identityPeriodEnd: "wechat-pay-ocr-review-identity_period_end",
  contactType: "wechat-pay-applyment-contact_type",
  superAdminName: "wechat-pay-ocr-review-super_admin_name",
  superAdminPhone: "wechat-pay-applyment-super_admin_phone",
  superAdminEmail: "wechat-pay-applyment-super_admin_email",
  contactIdentityNumber: "wechat-pay-ocr-review-contact_identity_number",
  contactIdentityAddress: "wechat-pay-ocr-review-contact_identity_address",
  contactIdentityPeriodBegin:
    "wechat-pay-ocr-review-contact_identity_period_begin",
  contactIdentityPeriodEnd:
    "wechat-pay-ocr-review-contact_identity_period_end",
  servicePhone: "wechat-pay-applyment-service_phone",
  settlementAccountType: "wechat-pay-applyment-settlement_account_type",
  settlementAccountName: "wechat-pay-applyment-settlement_account_name",
  settlementAccountNumber: "wechat-pay-ocr-review-settlement_account_number",
  settlementBankName: "wechat-pay-ocr-review-settlement_bank_name",
  settlementRule: "wechat-pay-applyment-settlement-rule",
  businessSceneDescription:
    "wechat-pay-applyment-business_scene_description",
  contactAddress: "wechat-pay-applyment-contact_address",
  licenseMaterials: "license-materials",
  legalIdMaterials: "legal-id-materials",
  contactIdMaterials: "contact-id-materials",
  settlementMaterials: "settlement-materials",
  businessMaterials: "business-materials",
} as const;

export type ApplymentTargetId =
  (typeof APPLYMENT_TARGET_IDS)[keyof typeof APPLYMENT_TARGET_IDS];

export type WechatPayApplymentPresentedBlocker = {
  readonly label: string;
  readonly targetStage: ApplymentStageKey;
  readonly targetId?: ApplymentTargetId;
};

export type WechatPayApplymentReadinessItem =
  WechatPayApplymentPresentedBlocker & {
    readonly key: string;
  };

const DEFAULT_BLOCKER: WechatPayApplymentPresentedBlocker = {
  label: "申请资料尚未满足提交条件",
  targetStage: "submit",
};

const REQUIRED_FIELD_PRESENTATIONS: Readonly<
  Record<string, WechatPayApplymentPresentedBlocker>
> = {
  subject_type: {
    label: "请选择主体类型",
    targetStage: "materials",
    targetId: APPLYMENT_TARGET_IDS.subjectType,
  },
  merchant_short_name: {
    label: "请填写商户简称",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.merchantShortName,
  },
  license_name: {
    label: "请核对营业执照主体名称",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.licenseName,
  },
  license_code: {
    label: "请核对统一社会信用代码",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.licenseCode,
  },
  legal_representative_name: {
    label: "请核对法人姓名",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.legalRepresentativeName,
  },
  identity_doc_type: {
    label: "请确认法人证件类型",
    targetStage: "recognition",
  },
  identity_address: {
    label: "请核对法人身份证地址",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.identityAddress,
  },
  identity_period_begin: {
    label: "请核对身份证有效期开始日期",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.identityPeriodBegin,
  },
  identity_period_end: {
    label: "身份证有效期尚未确认",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.identityPeriodEnd,
  },
  contact_type: {
    label: "请选择超级管理员身份",
    targetStage: "materials",
    targetId: APPLYMENT_TARGET_IDS.contactType,
  },
  super_admin_name: {
    label: "请核对超级管理员姓名",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.superAdminName,
  },
  super_admin_phone_masked: {
    label: "请填写超级管理员手机号",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.superAdminPhone,
  },
  super_admin_email: {
    label: "请填写超级管理员邮箱",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.superAdminEmail,
  },
  contact_identity_doc_type: {
    label: "请确认经办人证件类型",
    targetStage: "recognition",
  },
  contact_identity_period_begin: {
    label: "请核对经办人证件有效期开始日期",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.contactIdentityPeriodBegin,
  },
  contact_identity_period_end: {
    label: "请核对经办人证件有效期结束日期",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.contactIdentityPeriodEnd,
  },
  service_phone: {
    label: "请填写客服电话",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.servicePhone,
  },
  settlement_account_type: {
    label: "请选择结算账户类型",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.settlementAccountType,
  },
  settlement_account_name: {
    label: "请填写结算账户开户名",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.settlementAccountName,
  },
  settlement_bank_name: {
    label: "请核对开户银行",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.settlementBankName,
  },
  settlement_account_number_masked: {
    label: "请核对银行账号",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.settlementAccountNumber,
  },
  settlement_account_summary: {
    label: "结算账户信息尚未完整保存",
    targetStage: "recognition",
  },
  settlement_id: {
    label: "请选择经营行业与结算规则",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.settlementRule,
  },
  qualification_type: {
    label: "请选择经营行业与结算规则",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.settlementRule,
  },
  business_scene_description: {
    label: "请填写经营场景说明",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.businessSceneDescription,
  },
  contact_address: {
    label: "请填写经营联系地址",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.contactAddress,
  },
  "sensitive.identity_number": {
    label: "请核对法人身份证号码",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.identityNumber,
  },
  "sensitive.identity_name": {
    label: "请核对法人身份证姓名",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.identityName,
  },
  "sensitive.contact_name": {
    label: "请核对超级管理员姓名",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.superAdminName,
  },
  "sensitive.contact_phone": {
    label: "请填写超级管理员手机号",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.superAdminPhone,
  },
  "sensitive.contact_email": {
    label: "请填写超级管理员邮箱",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.superAdminEmail,
  },
  "sensitive.contact_identity_number": {
    label: "请核对经办人身份证号码",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.contactIdentityNumber,
  },
  "sensitive.contact_identity_address": {
    label: "请核对经办人身份证地址",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.contactIdentityAddress,
  },
  "sensitive.bank_account_name": {
    label: "请填写结算账户开户名",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.settlementAccountName,
  },
  "sensitive.bank_account_number": {
    label: "请核对银行账号",
    targetStage: "recognition",
    targetId: APPLYMENT_TARGET_IDS.settlementAccountNumber,
  },
};

const ATTACHMENT_CATEGORIES = new Set<string>(
  WECHAT_PAY_APPLYMENT_ATTACHMENT_CATEGORIES,
);

const ATTACHMENT_TARGET_IDS: Partial<
  Record<WechatPayApplymentAttachmentCategory, ApplymentTargetId>
> = {
  license_copy: APPLYMENT_TARGET_IDS.licenseMaterials,
  legal_representative_id_card_front: APPLYMENT_TARGET_IDS.legalIdMaterials,
  legal_representative_id_card_back: APPLYMENT_TARGET_IDS.legalIdMaterials,
  contact_id_card_front: APPLYMENT_TARGET_IDS.contactIdMaterials,
  contact_id_card_back: APPLYMENT_TARGET_IDS.contactIdMaterials,
  settlement_account_proof: APPLYMENT_TARGET_IDS.settlementMaterials,
  business_scene_material: APPLYMENT_TARGET_IDS.businessMaterials,
};

function isAttachmentCategory(
  category?: string,
): category is WechatPayApplymentAttachmentCategory {
  return Boolean(category && ATTACHMENT_CATEGORIES.has(category));
}

function getAttachmentTargetId(
  category?: string,
): ApplymentTargetId | undefined {
  return isAttachmentCategory(category)
    ? ATTACHMENT_TARGET_IDS[category]
    : undefined;
}

function getAttachmentLabel(category?: string): string {
  return getWechatPayApplymentAttachmentCategoryLabel(
    isAttachmentCategory(category) ? category : undefined,
  ).replace(/照片$/, "");
}

function presentMissingAttachment(
  category?: string,
): WechatPayApplymentPresentedBlocker {
  const label = getAttachmentLabel(category);
  return withTargetId(
    { label: `缺少${label}`, targetStage: "materials" },
    getAttachmentTargetId(category),
  );
}

type BlockerPresenter = (
  blocker: WechatPayApplymentPreflightBlocker,
) => WechatPayApplymentPresentedBlocker;

function fixedPresenter(
  presentation: WechatPayApplymentPresentedBlocker,
): BlockerPresenter {
  return () => presentation;
}

function withTargetId(
  presentation: WechatPayApplymentPresentedBlocker,
  targetId?: ApplymentTargetId,
): WechatPayApplymentPresentedBlocker {
  return targetId ? { ...presentation, targetId } : presentation;
}

const platformPresenter = fixedPresenter({
  label: "平台微信支付配置尚未就绪，请联系平台管理员",
  targetStage: "submit",
});

const BLOCKER_PRESENTERS = {
  APPLYMENT_SENSITIVE_PAYLOAD_MISSING: fixedPresenter({
    label: "请完整核对法人、联系人和结算账户信息",
    targetStage: "recognition",
  }),
  APPLYMENT_REQUIRED_ATTACHMENT_MISSING: (blocker) =>
    presentMissingAttachment(blocker.category),
  APPLYMENT_REQUIRED_FIELD_MISSING: (blocker) => {
    if (!blocker.field) return DEFAULT_BLOCKER;
    return REQUIRED_FIELD_PRESENTATIONS[blocker.field] ?? DEFAULT_BLOCKER;
  },
  APPLYMENT_MEDIA_METADATA_INVALID: (blocker) =>
    withTargetId({
      label: "申请附件信息不完整，请重新上传",
      targetStage: "materials",
    }, getAttachmentTargetId(blocker.category)),
  APPLYMENT_MEDIA_CATEGORY_INVALID: fixedPresenter({
    label: "申请附件类型无法识别，请重新上传",
    targetStage: "materials",
  }),
  APPLYMENT_MEDIA_CATEGORY_DUPLICATE: (blocker) =>
    withTargetId({
      label: `${getAttachmentLabel(blocker.category)}请仅保留一份`,
      targetStage: "materials",
    }, getAttachmentTargetId(blocker.category)),
  APPLYMENT_OBJECT_KEY_INVALID: (blocker) =>
    withTargetId({
      label: `${getAttachmentLabel(blocker.category)}归属异常，请重新上传`,
      targetStage: "materials",
    }, getAttachmentTargetId(blocker.category)),
  APPLYMENT_MEDIA_TYPE_UNSUPPORTED: (blocker) =>
    withTargetId({
      label: `${getAttachmentLabel(blocker.category)}格式不支持，请上传 JPG、PNG 或 BMP`,
      targetStage: "materials",
    }, getAttachmentTargetId(blocker.category)),
  APPLYMENT_MEDIA_SIZE_INVALID: (blocker) =>
    withTargetId({
      label: `${getAttachmentLabel(blocker.category)}文件大小无效，请重新上传`,
      targetStage: "materials",
    }, getAttachmentTargetId(blocker.category)),
  APPLYMENT_MEDIA_TOO_LARGE: (blocker) =>
    withTargetId({
      label: `${getAttachmentLabel(blocker.category)}超过 2 MB，请压缩后重新上传`,
      targetStage: "materials",
    }, getAttachmentTargetId(blocker.category)),
  APPLYMENT_SENSITIVE_PAYLOAD_VERSION_MISMATCH: fixedPresenter({
    label: "法人、联系人或结算账户信息已变化，请重新核对",
    targetStage: "recognition",
  }),
  APPLYMENT_SENSITIVE_PAYLOAD_UNREADABLE: fixedPresenter({
    label: "法人、联系人或结算账户信息无法读取，请重新填写",
    targetStage: "recognition",
  }),
  APPLYMENT_ENTERPRISE_ACCOUNT_TYPE_INVALID: fixedPresenter({
    label: "企业主体须选择对公结算账户",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.settlementAccountType,
  }),
  APPLYMENT_SETTLEMENT_RULE_INVALID: fixedPresenter({
    label: "经营行业与结算规则不匹配，请重新选择",
    targetStage: "supplement",
    targetId: APPLYMENT_TARGET_IDS.settlementRule,
  }),
  APPLYMENT_ATTACHMENT_OCR_REVIEW_REQUIRED: (blocker) =>
    withTargetId({
      label: `请核对${getAttachmentLabel(blocker.category)}识别结果`,
      targetStage: "recognition",
    }, getAttachmentTargetId(blocker.category)),
  APPLYMENT_ATTACHMENT_OCR_RECOGNITION_MISMATCH: (blocker) =>
    withTargetId({
      label: `${getAttachmentLabel(blocker.category)}识别记录与当前申请不一致，请重新识别`,
      targetStage: "recognition",
    }, getAttachmentTargetId(blocker.category)),
  PREFLIGHT_DATA_ACCESS_FAILED: fixedPresenter({
    label: "暂时无法核验申请资料，请稍后重试",
    targetStage: "submit",
  }),
  APPLYMENT_STATUS_NOT_SUBMITTABLE: fixedPresenter({
    label: "当前申请状态暂不能向微信提交",
    targetStage: "submit",
  }),
  APPLYMENT_SUBMISSION_LEASE_INVALID: fixedPresenter({
    label: "申请提交状态异常，请刷新后重试",
    targetStage: "submit",
  }),
  APPLYMENT_SUBMISSION_IN_PROGRESS: fixedPresenter({
    label: "申请正在提交，请稍候刷新",
    targetStage: "submit",
  }),
  APPLYMENT_NOT_FOUND: fixedPresenter({
    label: "申请资料不存在或已失效，请刷新后重试",
    targetStage: "submit",
  }),
  PREFLIGHT_INTERNAL_ERROR: fixedPresenter({
    label: "暂时无法核验申请资料，请稍后重试",
    targetStage: "submit",
  }),
  PLATFORM_PAYMENT_CONFIG_MISSING: platformPresenter,
  PLATFORM_PAYMENT_CONFIG_INACTIVE: platformPresenter,
  PLATFORM_PAYMENT_CONFIG_NOT_VALIDATED: platformPresenter,
  PLATFORM_PAYMENT_MERCHANT_MODE_MISMATCH: platformPresenter,
  PLATFORM_PAYMENT_MERCHANT_ID_MISSING: platformPresenter,
  PLATFORM_PAYMENT_APP_ID_MISSING: platformPresenter,
  PLATFORM_PAYMENT_SECRET_REF_MISSING: platformPresenter,
  PLATFORM_PAYMENT_SECRET_BUNDLE_REVISION_MISSING: platformPresenter,
  PLATFORM_PAYMENT_SERIAL_NO_MISSING: platformPresenter,
  PLATFORM_PAYMENT_CALLBACK_URL_MISSING: platformPresenter,
  PLATFORM_PAYMENT_CALLBACK_URL_INVALID: platformPresenter,
  PLATFORM_PAYMENT_REQUIRED_CHANNELS_MISSING: platformPresenter,
  PLATFORM_PAYMENT_PROFILE_NOT_READY: platformPresenter,
  WECHAT_PAY_APPLYMENT_PROFILE_INCOMPLETE: platformPresenter,
  WECHAT_PAY_SECRET_REF_REQUIRED: platformPresenter,
  WECHAT_PAY_SECRET_BUNDLE_INVALID: platformPresenter,
} satisfies Record<WechatPayApplymentKnownBlockerCode, BlockerPresenter>;

export function presentApplymentBlocker(
  blocker: WechatPayApplymentPreflightBlocker,
): WechatPayApplymentPresentedBlocker {
  return isWechatPayApplymentKnownBlockerCode(blocker.code)
    ? BLOCKER_PRESENTERS[blocker.code](blocker)
    : DEFAULT_BLOCKER;
}

export function presentApplymentBlockers(
  blockers: readonly WechatPayApplymentPreflightBlocker[],
): WechatPayApplymentReadinessItem[] {
  const seen = new Set<string>();
  const result: WechatPayApplymentReadinessItem[] = [];
  for (const blocker of blockers) {
    const presented = presentApplymentBlocker(blocker);
    const key = `${presented.targetStage}:${presented.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ key, ...presented });
  }
  return result;
}

export type ApplymentReadinessTargetEnvironment = {
  getElementById: (
    targetId: ApplymentTargetId,
  ) => Pick<HTMLElement, "scrollIntoView" | "focus"> | null;
  prefersReducedMotion: () => boolean;
};

export function focusApplymentReadinessTarget(
  targetId: ApplymentTargetId,
  environment: ApplymentReadinessTargetEnvironment = {
    getElementById: (id) => document.getElementById(id),
    prefersReducedMotion: () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  },
): boolean {
  const target = environment.getElementById(targetId);
  if (!target) return false;
  target.scrollIntoView({
    behavior: environment.prefersReducedMotion() ? "auto" : "smooth",
    block: "center",
  });
  target.focus({ preventScroll: true });
  return true;
}
