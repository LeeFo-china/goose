"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
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
import type {
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
  scope,
  setScope,
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
  assigneeEmployeeId: string;
  setAssigneeEmployeeId: (value: string) => void;
  scope: PlatformServiceTrialCapability[];
  setScope: (value: PlatformServiceTrialCapability[]) => void;
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
        <FieldLabel htmlFor={`trial-assignee-${trialId}`}>跟进人员工 ID</FieldLabel>
        <Input id={`trial-assignee-${trialId}`} value={assigneeEmployeeId} onChange={(event) => setAssigneeEmployeeId(event.target.value)} placeholder={trialType === "guided" ? "陪跑试用必填" : "可选"} required={trialType === "guided"} />
      </Field>
      <FieldSet>
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
