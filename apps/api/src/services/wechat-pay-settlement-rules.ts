import { normalizeWechatPayQualificationType } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import {
  wechatPaySettlementRuleRepository,
  type FindWechatPaySettlementRuleInput,
  type WechatPaySettlementRuleListInput,
  type WechatPaySettlementRuleListResult,
  type WechatPaySettlementRuleRecord,
} from "@/repositories/wechat-pay-settlement-rules";

export type {
  FindWechatPaySettlementRuleInput,
  WechatPaySettlementRuleListInput,
  WechatPaySettlementRuleListResult,
  WechatPaySettlementRuleRecord,
} from "@/repositories/wechat-pay-settlement-rules";

export type WechatPaySettlementRuleRepositoryPort = {
  listActive: (
    input: WechatPaySettlementRuleListInput,
  ) => Promise<WechatPaySettlementRuleListResult>;
  findActiveRule: (
    input: FindWechatPaySettlementRuleInput,
  ) => Promise<WechatPaySettlementRuleRecord | null>;
};

export type WechatPaySettlementRuleFields = {
  subject_type?: string | null;
  settlement_id?: string | null;
  qualification_type?: string | null;
};

export class WechatPaySettlementRuleService {
  private readonly repository: WechatPaySettlementRuleRepositoryPort;

  constructor(dependencies: {
    repository?: WechatPaySettlementRuleRepositoryPort;
  } = {}) {
    this.repository = dependencies.repository ?? wechatPaySettlementRuleRepository;
  }

  async listTenantOptions(
    input: Partial<WechatPaySettlementRuleListInput> = {},
  ): Promise<WechatPaySettlementRuleListResult> {
    return this.repository.listActive({
      page: input.page ?? 1,
      pageSize: Math.min(input.pageSize ?? 100, 100),
      ...(input.subject_type ? { subject_type: input.subject_type } : {}),
    });
  }

  async assertActiveRule(input: WechatPaySettlementRuleFields): Promise<void> {
    const subjectType = normalizeSubjectType(input.subject_type);
    const settlementId = input.settlement_id?.trim();
    const qualificationType = input.qualification_type?.trim();
    if (!subjectType || !settlementId || !qualificationType) return;

    const rule = await this.repository.findActiveRule({
      subjectType,
      settlementId,
      qualificationType: normalizeWechatPayQualificationType(qualificationType),
    });
    if (rule) return;

    throw Errors.business(
      400,
      "请选择有效的微信支付经营行业与结算规则",
      "WECHAT_PAY_SETTLEMENT_RULE_INVALID",
      {
        subject_type: subjectType,
        settlement_id: settlementId,
        qualification_type: qualificationType,
      },
    );
  }
}

function normalizeSubjectType(
  value: string | null | undefined,
): WechatPaySettlementRuleRecord["subject_type"] | null {
  if (
    value === "SUBJECT_TYPE_ENTERPRISE" ||
    value === "SUBJECT_TYPE_INDIVIDUAL"
  ) {
    return value;
  }
  return null;
}

export const wechatPaySettlementRuleService =
  new WechatPaySettlementRuleService();
