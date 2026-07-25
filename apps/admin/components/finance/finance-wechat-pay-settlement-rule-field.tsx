"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  findWechatPayDefaultSettlementRule,
} from "./finance-wechat-pay-applyment-subject-type";
import type {
  WechatPaySettlementRuleRecord,
} from "./finance-wechat-pay-applyment-shared";

const FIELD_ID = "wechat-pay-applyment-settlement-rule";

type Props = {
  subjectType: string;
  settlementId?: string | null;
  qualificationType?: string | null;
  settlementRules: readonly WechatPaySettlementRuleRecord[];
  disabled?: boolean;
  onValueChange?: (overrides: {
    settlement_id: string;
    qualification_type: string;
  }) => void;
};

export function FinanceWechatPaySettlementRuleField({
  subjectType,
  settlementId,
  qualificationType,
  settlementRules,
  disabled,
  onValueChange,
}: Props) {
  const normalizedSubjectType = normalizeSubjectType(subjectType);
  const rules = settlementRules.filter((rule) =>
    rule.status === "active" && rule.subject_type === normalizedSubjectType
  );
  const defaultRule = findWechatPayDefaultSettlementRule(
    subjectType,
    settlementRules,
  );
  const savedRule = settlementId && qualificationType
    ? rules.find((rule) =>
      rule.settlement_id === settlementId &&
      rule.qualification_type === qualificationType
    )
    : undefined;
  const fallbackRule = savedRule ?? defaultRule;
  const [selectedRuleId, setSelectedRuleId] = useState(fallbackRule?.id ?? "");
  const selectedRule = rules.find((rule) => rule.id === selectedRuleId) ??
    fallbackRule;

  useEffect(() => {
    setSelectedRuleId(fallbackRule?.id ?? "");
  }, [fallbackRule?.id, normalizedSubjectType]);

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={FIELD_ID} className="flex items-center gap-2">
        <span>经营行业与结算规则</span>
        <Badge variant="secondary">必填</Badge>
      </FieldLabel>
      <input
        type="hidden"
        name="settlement_id"
        value={selectedRule?.settlement_id ?? ""}
      />
      <input
        type="hidden"
        name="qualification_type"
        value={selectedRule?.qualification_type ?? ""}
      />
      <Select
        value={selectedRule?.id ?? ""}
        onValueChange={(value) => {
          setSelectedRuleId(value);
          const nextRule = rules.find((rule) => rule.id === value);
          if (nextRule) {
            onValueChange?.({
              settlement_id: nextRule.settlement_id,
              qualification_type: nextRule.qualification_type,
            });
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger id={FIELD_ID} aria-required="true">
          <SelectValue placeholder="请选择经营行业与结算规则" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {rules.map((rule) => (
              <SelectItem key={rule.id} value={rule.id}>
                {formatRuleLabel(rule)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>
        系统根据主体类型提交微信对应规则，无需填写技术编号。
        {selectedRule
          ? ` 微信行业：${selectedRule.qualification_type}。`
          : " 当前主体暂无可用规则，请联系平台维护字典。"}
      </FieldDescription>
    </Field>
  );
}

function formatRuleLabel(rule: {
  label: string;
  rate_label: string;
  settlement_cycle_label: string;
}) {
  return `${rule.label} · ${rule.rate_label} · ${rule.settlement_cycle_label}`;
}

function normalizeSubjectType(value: string) {
  return value === "SUBJECT_TYPE_INDIVIDUAL"
    ? "SUBJECT_TYPE_INDIVIDUAL"
    : "SUBJECT_TYPE_ENTERPRISE";
}
