"use client";

import { useId, useState } from "react";
import { PLATFORM_SERVICE_TRIAL_FULL_SCOPE, type PlatformServiceTrialCapability } from "@gooes/domain";
import { FormSelect } from "@/components/admin/form-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { trialCapabilityOptions } from "./platform-service-trial-rules";

export const TRIAL_SCOPE_BILLING_NOTICE = "完整业务仅开放模块访问；AI、OCR、短信、视频等按量资源仍独立计费，不包含免费无限额度。操作权限、企业核验和支付前置条件仍然适用。";

export function PlatformServiceTrialScopeSelector({ scope, setScope, title = "试用范围", disabled = false, scopeErrorId }: {
  scope: PlatformServiceTrialCapability[];
  setScope: (scope: PlatformServiceTrialCapability[]) => void;
  title?: string;
  disabled?: boolean;
  scopeErrorId?: string;
}) {
  const id = useId();
  const isFull = PLATFORM_SERVICE_TRIAL_FULL_SCOPE.capabilities.every((value) => scope.includes(value));
  const [custom, setCustom] = useState(!isFull);
  const mode = custom || !isFull ? "custom" : "full";
  return (
    <FieldSet disabled={disabled} aria-describedby={scopeErrorId || `${id}-description`}
      aria-invalid={Boolean(scopeErrorId)} data-invalid={Boolean(scopeErrorId)}>
      <FieldLegend variant="label">{title}</FieldLegend>
      <Field>
        <FieldLabel htmlFor={`${id}-mode`}>范围模式</FieldLabel>
        <FormSelect id={`${id}-mode`} value={mode} disabled={disabled}
          options={[{ value: "full", label: "完整业务" }, { value: "custom", label: "自定义模块" }]}
          onChange={(value) => {
            setCustom(value === "custom");
            if (value === "full") setScope([...PLATFORM_SERVICE_TRIAL_FULL_SCOPE.capabilities]);
          }} />
      </Field>
      {mode === "custom" ? <div className="grid gap-3 sm:grid-cols-2">
        {trialCapabilityOptions.map((option) => (
          <Field key={option.value} orientation="horizontal" data-disabled={disabled}>
            <Checkbox id={`${id}-${option.value}`} disabled={disabled} checked={scope.includes(option.value)}
              aria-invalid={Boolean(scopeErrorId)} aria-describedby={scopeErrorId}
              onCheckedChange={(checked) => setScope(trialCapabilityOptions
                .filter(({ value }) => value === option.value ? checked === true : scope.includes(value))
                .map(({ value }) => value))} />
            <FieldLabel htmlFor={`${id}-${option.value}`} className="font-normal">{option.label}</FieldLabel>
          </Field>
        ))}
      </div> : <FieldDescription>包含全部 {PLATFORM_SERVICE_TRIAL_FULL_SCOPE.capabilities.length} 个业务模块：{trialCapabilityOptions.map(({ label }) => label).join("、")}。</FieldDescription>}
      <FieldDescription id={`${id}-description`}>{TRIAL_SCOPE_BILLING_NOTICE}</FieldDescription>
    </FieldSet>
  );
}
