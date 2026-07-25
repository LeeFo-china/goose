import type {
  WechatPaySettlementRuleRecord,
} from "./finance-wechat-pay-applyment-shared";

export type WechatPayApplymentSubjectType =
  | "SUBJECT_TYPE_ENTERPRISE"
  | "SUBJECT_TYPE_INDIVIDUAL";

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
  settlementRules: readonly WechatPaySettlementRuleRecord[],
): WechatPayApplymentSubjectTypeOverrides {
  const subjectType = normalizeSubjectType(value);
  const settlementRule = findWechatPayDefaultSettlementRule(
    subjectType,
    settlementRules,
  );
  if (!settlementRule) {
    throw new Error(`主体类型 ${subjectType} 缺少可用结算规则`);
  }

  return {
    subject_type: subjectType,
    settlement_account_type: subjectType === "SUBJECT_TYPE_ENTERPRISE"
      ? "BANK_ACCOUNT_TYPE_CORPORATE"
      : "BANK_ACCOUNT_TYPE_PERSONAL",
    settlement_id: settlementRule.settlement_id,
    qualification_type: settlementRule.qualification_type,
  };
}

export function findWechatPayDefaultSettlementRule(
  value: string,
  settlementRules: readonly WechatPaySettlementRuleRecord[],
): WechatPaySettlementRuleRecord | null {
  const subjectType = normalizeSubjectType(value);
  return settlementRules.find((rule) =>
    rule.status === "active" && rule.subject_type === subjectType
  ) ?? null;
}

function normalizeSubjectType(
  value: string,
): WechatPayApplymentSubjectType {
  return value === "SUBJECT_TYPE_INDIVIDUAL"
    ? "SUBJECT_TYPE_INDIVIDUAL"
    : "SUBJECT_TYPE_ENTERPRISE";
}
