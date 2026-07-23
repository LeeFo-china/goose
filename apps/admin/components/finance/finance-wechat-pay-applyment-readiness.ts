import type { ApplymentStageKey } from "./finance-wechat-pay-applyment-flow-model";
import {
  getWechatPayApplymentAttachmentCategoryLabel,
  type WechatPayApplymentAttachmentCategory,
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

function presentMissingAttachment(
  category?: string,
): WechatPayApplymentPresentedBlocker {
  const label = getWechatPayApplymentAttachmentCategoryLabel(
    category && ATTACHMENT_CATEGORIES.has(category)
      ? category as WechatPayApplymentAttachmentCategory
      : undefined,
  ).replace(/照片$/, "");
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
  if (blocker.code === "APPLYMENT_SENSITIVE_PAYLOAD_MISSING") {
    return {
      label: "请完整核对法人、联系人和结算账户信息",
      targetStage: "recognition",
    };
  }
  return DEFAULT_BLOCKER;
}

export function presentApplymentBlockers(
  blockers: readonly WechatPayApplymentPreflightBlocker[],
): WechatPayApplymentReadinessItem[] {
  const keyCounts = new Map<string, number>();
  return blockers.map((blocker) => {
    const baseKey = [
      blocker.code,
      blocker.field ?? blocker.category ?? "unknown",
    ].join(":");
    const occurrence = (keyCounts.get(baseKey) ?? 0) + 1;
    keyCounts.set(baseKey, occurrence);
    return {
      key: occurrence === 1 ? baseKey : `${baseKey}:${occurrence}`,
      ...presentApplymentBlocker(blocker),
    };
  });
}
