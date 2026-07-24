import {
  getWechatPaySettlementRulesForSubject,
  type WechatPayApplymentSubjectType,
} from "@gooes/domain";

export type WechatPayApplymentSubjectTypeOverrides = {
  subject_type: WechatPayApplymentSubjectType;
  settlement_account_type:
    | "BANK_ACCOUNT_TYPE_CORPORATE"
    | "BANK_ACCOUNT_TYPE_PERSONAL";
  settlement_id: string;
  qualification_type: string;
};

export function buildWechatPayApplymentSubjectTypeOverrides(
  value: string,
): WechatPayApplymentSubjectTypeOverrides {
  const subjectType = normalizeSubjectType(value);
  const settlementRule = getWechatPaySettlementRulesForSubject(subjectType)[0];
  if (!settlementRule) {
    throw new Error(`主体类型 ${subjectType} 缺少可用结算规则`);
  }

  return {
    subject_type: subjectType,
    settlement_account_type: subjectType === "SUBJECT_TYPE_ENTERPRISE"
      ? "BANK_ACCOUNT_TYPE_CORPORATE"
      : "BANK_ACCOUNT_TYPE_PERSONAL",
    settlement_id: settlementRule.id,
    qualification_type: settlementRule.qualificationType,
  };
}

function normalizeSubjectType(
  value: string,
): WechatPayApplymentSubjectType {
  return value === "SUBJECT_TYPE_INDIVIDUAL"
    ? "SUBJECT_TYPE_INDIVIDUAL"
    : "SUBJECT_TYPE_ENTERPRISE";
}
