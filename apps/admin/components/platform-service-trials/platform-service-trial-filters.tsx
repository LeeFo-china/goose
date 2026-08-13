"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FilterSelect } from "@/components/admin/filter-select";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { PlatformServiceTrialAssigneeCombobox } from "./platform-service-trial-assignee-combobox";

import {
  trialSourceOptions,
  trialStatusOptions,
  trialTypeOptions,
} from "./platform-service-trial-rules";
import type { PlatformServiceTrialAssigneeCandidate } from "./platform-service-trial-types";

export type PlatformServiceTrialFilterValues = {
  keyword?: string;
  status?: string;
  source?: string;
  trialType?: string;
  assigneeEmployeeId?: string;
  appliedFrom?: string;
  appliedTo?: string;
  expiresFrom?: string;
  expiresTo?: string;
};

export function PlatformServiceTrialFilters({
  values,
  pageSize,
  initialAssigneeCandidate,
}: {
  values: PlatformServiceTrialFilterValues;
  pageSize: number;
  initialAssigneeCandidate: PlatformServiceTrialAssigneeCandidate | null;
}) {
  const [assigneeEmployeeId, setAssigneeEmployeeId] = useState<string | null>(
    values.assigneeEmployeeId ?? null,
  );

  useEffect(() => {
    setAssigneeEmployeeId(values.assigneeEmployeeId ?? null);
  }, [values.assigneeEmployeeId]);

  return (
    <form
      className="flex flex-col gap-2"
      action="/platform/service-orders"
    >
      <input type="hidden" name="tab" value="trials" />
      <input type="hidden" name="trialPageSize" value={pageSize} />
      <input
        type="hidden"
        name="trialAssigneeEmployeeId"
        value={assigneeEmployeeId ?? ""}
      />
      <div className="flex flex-wrap items-end gap-2">
        <Field className="min-w-[240px] flex-1 gap-1">
          <FieldLabel htmlFor="trial-keyword" className="text-xs">
            关键词
          </FieldLabel>
          <Input
            id="trial-keyword"
            name="trialKeyword"
            defaultValue={values.keyword}
            placeholder="企业名称、联系人或手机号"
            className="h-9"
          />
        </Field>
        <FilterSelect
          label="状态"
          name="trialStatus"
          defaultValue={values.status}
          options={[...trialStatusOptions]}
        />
        <FilterSelect
          label="来源"
          name="trialSource"
          defaultValue={values.source}
          options={[...trialSourceOptions]}
        />
        <FilterSelect
          label="类型"
          name="trialType"
          defaultValue={values.trialType}
          options={[...trialTypeOptions]}
        />
        <Field className="w-full gap-1 sm:w-52">
          <FieldLabel htmlFor="trial-assignee" className="text-xs">
            跟进人
          </FieldLabel>
          <PlatformServiceTrialAssigneeCombobox
            id="trial-assignee"
            value={assigneeEmployeeId}
            onChange={setAssigneeEmployeeId}
            initialCandidate={initialAssigneeCandidate}
            allowClear
            placeholder="全部跟进人"
            aria-label="按平台跟进人筛选"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <DateFilter
          id="trial-applied-from"
          name="trialAppliedFrom"
          label="申请开始"
          defaultValue={values.appliedFrom}
        />
        <DateFilter
          id="trial-applied-to"
          name="trialAppliedTo"
          label="申请结束"
          defaultValue={values.appliedTo}
        />
        <DateFilter
          id="trial-expires-from"
          name="trialExpiresFrom"
          label="到期开始"
          defaultValue={values.expiresFrom}
        />
        <DateFilter
          id="trial-expires-to"
          name="trialExpiresTo"
          label="到期结束"
          defaultValue={values.expiresTo}
        />
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/platform/service-orders?tab=trials&trialPageSize=${pageSize}`}>
              重置筛选
            </Link>
          </Button>
          <Button type="submit" size="sm">应用筛选</Button>
        </div>
      </div>
    </form>
  );
}

function DateFilter({
  id,
  name,
  label,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <Field className="w-[9.5rem] gap-1">
      <FieldLabel htmlFor={id} className="text-xs">{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        type="date"
        defaultValue={defaultValue}
        className="h-9 tabular-nums"
      />
    </Field>
  );
}
