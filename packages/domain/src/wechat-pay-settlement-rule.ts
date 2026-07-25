export type WechatPayApplymentSubjectType =
  | 'SUBJECT_TYPE_ENTERPRISE'
  | 'SUBJECT_TYPE_INDIVIDUAL';

export interface WechatPaySettlementRule {
  readonly id: string;
  readonly subjectType: WechatPayApplymentSubjectType;
  readonly qualificationType: string;
  readonly label: string;
  readonly rateLabel: string;
  readonly settlementCycleLabel: string;
  readonly requiresSpecialQualification: boolean;
}

export const WECHAT_PAY_SETTLEMENT_RULES = [
  {
    id: '716',
    subjectType: 'SUBJECT_TYPE_ENTERPRISE',
    qualificationType: '零售',
    label: '零售',
    rateLabel: '0.6%',
    settlementCycleLabel: 'T+1',
    requiresSpecialQualification: false,
  },
  {
    id: '719',
    subjectType: 'SUBJECT_TYPE_INDIVIDUAL',
    qualificationType: '零售',
    label: '零售',
    rateLabel: '0.6%',
    settlementCycleLabel: 'T+1',
    requiresSpecialQualification: false,
  },
] as const satisfies readonly WechatPaySettlementRule[];

const WECHAT_PAY_LEGACY_QUALIFICATION_TYPE_MAP: ReadonlyMap<string, string> =
  new Map([
    ['零售批发/生活娱乐/其他', '零售'],
    ['零售批发/生活娱乐/网上商城/其他', '零售'],
  ]);

export function getWechatPaySettlementRulesForSubject(
  subjectType: WechatPayApplymentSubjectType,
): readonly WechatPaySettlementRule[] {
  return WECHAT_PAY_SETTLEMENT_RULES.filter(
    (rule) => rule.subjectType === subjectType,
  );
}

export function normalizeWechatPayQualificationType(
  qualificationType: string,
): string {
  return WECHAT_PAY_LEGACY_QUALIFICATION_TYPE_MAP.get(qualificationType) ??
    qualificationType;
}

export function findWechatPaySettlementRule(
  subjectType: WechatPayApplymentSubjectType,
  settlementId: string,
  qualificationType: string,
): WechatPaySettlementRule | undefined {
  const normalizedQualificationType =
    normalizeWechatPayQualificationType(qualificationType);

  return WECHAT_PAY_SETTLEMENT_RULES.find(
    (rule) =>
      rule.subjectType === subjectType &&
      rule.id === settlementId &&
      rule.qualificationType === normalizedQualificationType,
  );
}
