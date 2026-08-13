"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { trialCapabilityOptions, trialTypeOptions } from "./platform-service-trial-rules";
import { PlatformServiceTrialAssigneeCombobox } from "./platform-service-trial-assignee-combobox";
import type {
  PlatformServiceTrialAssigneeCandidate,
  PlatformServiceTrialCapability,
  PlatformServiceTrialType,
} from "./platform-service-trial-types";

export function PlatformServiceTrialApprovalFields({
  trialId,
  trialType,
  setTrialType,
  startsAt,
  setStartsAt,
  trialDays,
  setTrialDays,
  graceDays,
  setGraceDays,
  assigneeEmployeeId,
  setAssigneeEmployeeId,
  assigneeCandidate,
  setAssigneeCandidate,
  scope,
  setScope,
  scopeErrorId,
}: {
  trialId: string;
  trialType: PlatformServiceTrialType;
  setTrialType: (value: PlatformServiceTrialType) => void;
  startsAt: string;
  setStartsAt: (value: string) => void;
  trialDays: string;
  setTrialDays: (value: string) => void;
  graceDays: string;
  setGraceDays: (value: string) => void;
  assigneeEmployeeId: string | null;
  setAssigneeEmployeeId: (value: string | null) => void;
  assigneeCandidate: PlatformServiceTrialAssigneeCandidate | null;
  setAssigneeCandidate: (value: PlatformServiceTrialAssigneeCandidate | null) => void;
  scope: PlatformServiceTrialCapability[];
  setScope: (value: PlatformServiceTrialCapability[]) => void;
  scopeErrorId?: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`trial-type-${trialId}`}>试用类型</FieldLabel>
          <Select value={trialType} onValueChange={(value) => setTrialType(value as PlatformServiceTrialType)}>
            <SelectTrigger id={`trial-type-${trialId}`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{trialTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`trial-start-${trialId}`}>开始时间</FieldLabel>
          <Input id={`trial-start-${trialId}`} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`trial-days-${trialId}`}>试用天数</FieldLabel>
          <Input id={`trial-days-${trialId}`} type="number" min={1} max={365} value={trialDays} onChange={(event) => setTrialDays(event.target.value)} required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`trial-grace-${trialId}`}>宽限期天数</FieldLabel>
          <Input id={`trial-grace-${trialId}`} type="number" min={0} max={30} value={graceDays} onChange={(event) => setGraceDays(event.target.value)} required />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`trial-assignee-${trialId}`}>平台跟进人</FieldLabel>
        <PlatformServiceTrialAssigneeCombobox
          id={`trial-assignee-${trialId}`}
          value={assigneeEmployeeId}
          onChange={setAssigneeEmployeeId}
          onCandidateChange={setAssigneeCandidate}
          initialCandidate={assigneeCandidate}
          required={trialType === "guided"}
          allowClear={trialType !== "guided"}
          placeholder={trialType === "guided" ? "请选择陪跑跟进人" : "选择平台跟进人（可选）"}
        />
        <FieldDescription>
          {trialType === "guided" ? "陪跑试用必须选择一位有效平台人员。" : "可按姓名或手机号搜索。"}
        </FieldDescription>
      </Field>
      <FieldSet
        aria-describedby={scopeErrorId}
        aria-invalid={Boolean(scopeErrorId)}
        data-invalid={Boolean(scopeErrorId)}
      >
        <FieldLegend variant="label">试用范围</FieldLegend>
        <div className="grid gap-2 sm:grid-cols-2">
          {trialCapabilityOptions.map((option) => (
            <Field key={option.value} orientation="horizontal">
              <Checkbox
                id={`${trialId}-${option.value}`}
                checked={scope.includes(option.value)}
                onCheckedChange={(checked) => setScope(checked
                  ? [...scope, option.value]
                  : scope.filter((value) => value !== option.value))}
              />
              <FieldLabel htmlFor={`${trialId}-${option.value}`} className="font-normal">{option.label}</FieldLabel>
            </Field>
          ))}
        </div>
      </FieldSet>
    </>
  );
}
