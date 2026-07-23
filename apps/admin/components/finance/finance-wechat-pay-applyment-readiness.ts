import type { ApplymentStageKey } from "./finance-wechat-pay-applyment-flow-model";
import {
  getWechatPayApplymentAttachmentCategoryLabel,
  type WechatPayApplymentAttachmentCategory,
  type WechatPayApplymentKnownPreflightBlockerCode,
  type WechatPayApplymentPreflightBlocker,
  WECHAT_PAY_APPLYMENT_ATTACHMENT_CATEGORIES,
} from "./finance-wechat-pay-applyment-shared";

export type WechatPayApplymentPresentedBlocker = {
  readonly label: string;
  readonly targetStage: ApplymentStageKey;
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
  subject_type: { label: "请选择主体类型", targetStage: "materials" },
  merchant_short_name: { label: "请填写商户简称", targetStage: "supplement" },
  license_name: {
    label: "请核对营业执照主体名称",
    targetStage: "recognition",
  },
  license_code: {
    label: "请核对统一社会信用代码",
    targetStage: "recognition",
  },
  legal_representative_name: {
    label: "请核对法人姓名",
    targetStage: "recognition",
  },
  identity_doc_type: {
    label: "请确认法人证件类型",
    targetStage: "recognition",
  },
  identity_address: {
    label: "请核对法人身份证地址",
    targetStage: "recognition",
  },
  identity_period_begin: {
    label: "请核对身份证有效期开始日期",
    targetStage: "recognition",
  },
  identity_period_end: {
    label: "身份证有效期尚未确认",
    targetStage: "recognition",
  },
  contact_type: {
    label: "请选择超级管理员身份",
    targetStage: "materials",
  },
  super_admin_name: {
    label: "请核对超级管理员姓名",
    targetStage: "recognition",
  },
  super_admin_phone_masked: {
    label: "请填写超级管理员手机号",
    targetStage: "supplement",
  },
  super_admin_email: {
    label: "请填写超级管理员邮箱",
    targetStage: "supplement",
  },
  contact_identity_doc_type: {
    label: "请确认经办人证件类型",
    targetStage: "recognition",
  },
  contact_identity_period_begin: {
    label: "请核对经办人证件有效期开始日期",
    targetStage: "recognition",
  },
  contact_identity_period_end: {
    label: "请核对经办人证件有效期结束日期",
    targetStage: "recognition",
  },
  service_phone: { label: "请填写客服电话", targetStage: "supplement" },
  settlement_account_type: {
    label: "请选择结算账户类型",
    targetStage: "supplement",
  },
  settlement_account_name: {
    label: "请填写结算账户开户名",
    targetStage: "supplement",
  },
  settlement_bank_name: {
    label: "请核对开户银行",
    targetStage: "recognition",
  },
  settlement_account_number_masked: {
    label: "请核对银行账号",
    targetStage: "recognition",
  },
  settlement_account_summary: {
    label: "结算账户信息尚未完整保存",
    targetStage: "recognition",
  },
  settlement_id: {
    label: "请选择经营行业与结算规则",
    targetStage: "supplement",
  },
  qualification_type: {
    label: "请选择经营行业与结算规则",
    targetStage: "supplement",
  },
  business_scene_description: {
    label: "请填写经营场景说明",
    targetStage: "supplement",
  },
  contact_address: {
    label: "请填写经营联系地址",
    targetStage: "supplement",
  },
  "sensitive.identity_number": {
    label: "请核对法人身份证号码",
    targetStage: "recognition",
  },
  "sensitive.identity_name": {
    label: "请核对法人身份证姓名",
    targetStage: "recognition",
  },
  "sensitive.contact_name": {
    label: "请核对超级管理员姓名",
    targetStage: "recognition",
  },
  "sensitive.contact_phone": {
    label: "请填写超级管理员手机号",
    targetStage: "supplement",
  },
  "sensitive.contact_email": {
    label: "请填写超级管理员邮箱",
    targetStage: "supplement",
  },
  "sensitive.contact_identity_number": {
    label: "请核对经办人身份证号码",
    targetStage: "recognition",
  },
  "sensitive.contact_identity_address": {
    label: "请核对经办人身份证地址",
    targetStage: "recognition",
  },
  "sensitive.bank_account_name": {
    label: "请填写结算账户开户名",
    targetStage: "supplement",
  },
  "sensitive.bank_account_number": {
    label: "请核对银行账号",
    targetStage: "recognition",
  },
};

const ATTACHMENT_CATEGORIES = new Set<string>(
  WECHAT_PAY_APPLYMENT_ATTACHMENT_CATEGORIES,
);

const FIXED_CODE_PRESENTATIONS = {
  APPLYMENT_STATUS_NOT_SUBMITTABLE: {
    label: "当前申请状态暂不能向微信提交",
    targetStage: "submit",
  },
  APPLYMENT_SUBMISSION_LEASE_INVALID: {
    label: "申请提交状态异常，请刷新后重试",
    targetStage: "submit",
  },
  APPLYMENT_SUBMISSION_IN_PROGRESS: {
    label: "申请正在提交，请稍候刷新",
    targetStage: "submit",
  },
  APPLYMENT_MEDIA_METADATA_INVALID: {
    label: "申请附件信息不完整，请重新上传",
    targetStage: "materials",
  },
  APPLYMENT_MEDIA_CATEGORY_INVALID: {
    label: "申请附件类型无法识别，请重新上传",
    targetStage: "materials",
  },
  APPLYMENT_ENTERPRISE_ACCOUNT_TYPE_INVALID: {
    label: "企业主体须选择对公结算账户",
    targetStage: "supplement",
  },
  APPLYMENT_SETTLEMENT_RULE_INVALID: {
    label: "经营行业与结算规则不匹配，请重新选择",
    targetStage: "supplement",
  },
  APPLYMENT_SENSITIVE_PAYLOAD_MISSING: {
    label: "请完整核对法人、联系人和结算账户信息",
    targetStage: "recognition",
  },
  APPLYMENT_SENSITIVE_PAYLOAD_VERSION_MISMATCH: {
    label: "法人、联系人或结算账户信息已变化，请重新核对",
    targetStage: "recognition",
  },
  APPLYMENT_SENSITIVE_PAYLOAD_UNREADABLE: {
    label: "法人、联系人或结算账户信息无法读取，请重新填写",
    targetStage: "recognition",
  },
  APPLYMENT_NOT_FOUND: {
    label: "申请资料不存在或已失效，请刷新后重试",
    targetStage: "submit",
  },
  PREFLIGHT_DATA_ACCESS_FAILED: {
    label: "暂时无法核验申请资料，请稍后重试",
    targetStage: "submit",
  },
  PREFLIGHT_INTERNAL_ERROR: {
    label: "暂时无法核验申请资料，请稍后重试",
    targetStage: "submit",
  },
} as const satisfies Partial<
  Record<
    WechatPayApplymentKnownPreflightBlockerCode,
    WechatPayApplymentPresentedBlocker
  >
>;

const PLATFORM_BLOCKER_CODES = new Set<string>([
  "PLATFORM_PAYMENT_CONFIG_MISSING",
  "PLATFORM_PAYMENT_CONFIG_INACTIVE",
  "PLATFORM_PAYMENT_CONFIG_NOT_VALIDATED",
  "PLATFORM_PAYMENT_MERCHANT_MODE_MISMATCH",
  "PLATFORM_PAYMENT_MERCHANT_ID_MISSING",
  "PLATFORM_PAYMENT_APP_ID_MISSING",
  "PLATFORM_PAYMENT_SECRET_REF_MISSING",
  "PLATFORM_PAYMENT_SECRET_BUNDLE_REVISION_MISSING",
  "PLATFORM_PAYMENT_SERIAL_NO_MISSING",
  "PLATFORM_PAYMENT_CALLBACK_URL_MISSING",
  "PLATFORM_PAYMENT_CALLBACK_URL_INVALID",
  "PLATFORM_PAYMENT_REQUIRED_CHANNELS_MISSING",
  "PLATFORM_PAYMENT_PROFILE_NOT_READY",
  "WECHAT_PAY_APPLYMENT_PROFILE_INCOMPLETE",
  "WECHAT_PAY_SECRET_REF_REQUIRED",
  "WECHAT_PAY_SECRET_BUNDLE_INVALID",
]);

function getAttachmentLabel(category?: string): string {
  return getWechatPayApplymentAttachmentCategoryLabel(
    category && ATTACHMENT_CATEGORIES.has(category)
      ? category as WechatPayApplymentAttachmentCategory
      : undefined,
  ).replace(/照片$/, "");
}

function presentMissingAttachment(
  category?: string,
): WechatPayApplymentPresentedBlocker {
  const label = getAttachmentLabel(category);
  return { label: `缺少${label}`, targetStage: "materials" };
}

export function presentApplymentBlocker(
  blocker: WechatPayApplymentPreflightBlocker,
): WechatPayApplymentPresentedBlocker {
  if (blocker.code === "APPLYMENT_REQUIRED_ATTACHMENT_MISSING") {
    return presentMissingAttachment(blocker.category);
  }
  if (blocker.code === "APPLYMENT_REQUIRED_FIELD_MISSING") {
    return blocker.field
      ? REQUIRED_FIELD_PRESENTATIONS[blocker.field] ?? DEFAULT_BLOCKER
      : DEFAULT_BLOCKER;
  }
  const attachmentLabel = getAttachmentLabel(blocker.category);
  if (blocker.code === "APPLYMENT_MEDIA_CATEGORY_DUPLICATE") {
    return {
      label: `${attachmentLabel}请仅保留一份`,
      targetStage: "materials",
    };
  }
  if (blocker.code === "APPLYMENT_OBJECT_KEY_INVALID") {
    return {
      label: `${attachmentLabel}归属异常，请重新上传`,
      targetStage: "materials",
    };
  }
  if (blocker.code === "APPLYMENT_MEDIA_TYPE_UNSUPPORTED") {
    return {
      label: `${attachmentLabel}格式不支持，请上传 JPG、PNG 或 BMP`,
      targetStage: "materials",
    };
  }
  if (blocker.code === "APPLYMENT_MEDIA_SIZE_INVALID") {
    return {
      label: `${attachmentLabel}文件大小无效，请重新上传`,
      targetStage: "materials",
    };
  }
  if (blocker.code === "APPLYMENT_MEDIA_TOO_LARGE") {
    return {
      label: `${attachmentLabel}超过 2 MB，请压缩后重新上传`,
      targetStage: "materials",
    };
  }
  if (blocker.code === "APPLYMENT_ATTACHMENT_OCR_REVIEW_REQUIRED") {
    return {
      label: `请核对${attachmentLabel}识别结果`,
      targetStage: "recognition",
    };
  }
  if (blocker.code === "APPLYMENT_ATTACHMENT_OCR_RECOGNITION_MISMATCH") {
    return {
      label: `${attachmentLabel}识别记录与当前申请不一致，请重新识别`,
      targetStage: "recognition",
    };
  }
  if (PLATFORM_BLOCKER_CODES.has(blocker.code)) {
    return {
      label: "平台微信支付配置尚未就绪，请联系平台管理员",
      targetStage: "submit",
    };
  }
  const fixed = FIXED_CODE_PRESENTATIONS[
    blocker.code as keyof typeof FIXED_CODE_PRESENTATIONS
  ];
  if (fixed) return fixed;
  return DEFAULT_BLOCKER;
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
