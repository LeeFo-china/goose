"use client";

import { useEffect, useState } from "react";
import {
  findWechatPaySettlementRule,
  getWechatPaySettlementRulesForSubject,
  type WechatPayApplymentSubjectType,
} from "@gooes/domain";
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

const FIELD_ID = "wechat-pay-applyment-settlement-rule";

type Props = {
  subjectType: string;
  settlementId?: string | null;
  qualificationType?: string | null;
  disabled?: boolean;
  onValueChange?: () => void;
};

export function FinanceWechatPaySettlementRuleField({
  subjectType,
  settlementId,
  qualificationType,
  disabled,
  onValueChange,
}: Props) {
  const normalizedSubjectType = normalizeSubjectType(subjectType);
  const rules = getWechatPaySettlementRulesForSubject(normalizedSubjectType);
  const savedRule = settlementId && qualificationType
    ? findWechatPaySettlementRule(
      normalizedSubjectType,
      settlementId,
      qualificationType,
    )
    : undefined;
  const fallbackRule = savedRule ?? rules[0];
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
        value={selectedRule?.id ?? ""}
      />
      <input
        type="hidden"
        name="qualification_type"
        value={selectedRule?.qualificationType ?? ""}
      />
      <Select
        value={selectedRule?.id ?? ""}
        onValueChange={(value) => {
          setSelectedRuleId(value);
          onValueChange?.();
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
          ? ` 微信行业：${selectedRule.qualificationType}。`
          : ""}
      </FieldDescription>
    </Field>
  );
}

function normalizeSubjectType(value: string): WechatPayApplymentSubjectType {
  return value === "SUBJECT_TYPE_INDIVIDUAL"
    ? "SUBJECT_TYPE_INDIVIDUAL"
    : "SUBJECT_TYPE_ENTERPRISE";
}

function formatRuleLabel(rule: {
  label: string;
  rateLabel: string;
  settlementCycleLabel: string;
}) {
  return `${rule.label} · ${rule.rateLabel} · ${rule.settlementCycleLabel}`;
}
