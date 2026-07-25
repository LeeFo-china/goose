import type { WechatPayApplymentRecord } from "@/repositories/wechat-pay-applyments";
import type { UpdateWechatPayApplymentInput } from "@/schema/wechat-pay-applyments";
import type {
  WechatPaySettlementRuleFields,
} from "@/services/wechat-pay-settlement-rules";

const SETTLEMENT_RULE_FIELDS = [
  "subject_type",
  "settlement_id",
  "qualification_type",
] as const;

export function hasWechatPaySettlementRulePatch(
  input: UpdateWechatPayApplymentInput,
) {
  return SETTLEMENT_RULE_FIELDS.some((field) => Object.hasOwn(input, field));
}

export function mergeWechatPaySettlementRuleFields(
  current: WechatPayApplymentRecord,
  input: UpdateWechatPayApplymentInput,
): WechatPaySettlementRuleFields {
  return {
    subject_type: input.subject_type === undefined
      ? current.subject_type
      : input.subject_type,
    settlement_id: input.settlement_id === undefined
      ? current.settlement_id
      : input.settlement_id,
    qualification_type: input.qualification_type === undefined
      ? current.qualification_type
      : input.qualification_type,
  };
}
