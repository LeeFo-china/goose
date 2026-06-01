"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import { FormSelect } from "@/components/admin/form-select";
import { campaignStatusOptions, campaignTypeOptions, targetScopeOptions } from "@/components/marketing/marketing-constants";
import { MarketingProjectSelector } from "@/components/marketing/marketing-project-selector";
import type { MarketingProjectOption } from "@/components/marketing/marketing-types";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  achievementModeOptions,
  booleanOptions,
  type CampaignFormValues,
} from "@/components/marketing/marketing-mutation-shared";

export function CampaignBasicFields({
  form,
  mode,
}: {
  form: UseFormReturn<CampaignFormValues>;
  mode: "create" | "edit";
}) {
  return (
    <FieldGroup className="grid gap-4 md:grid-cols-2">
      <Field data-invalid={!!form.formState.errors.name}>
        <FieldLabel htmlFor="marketing-name">活动名称</FieldLabel>
        <Input id="marketing-name" {...form.register("name")} />
        <FieldError errors={[form.formState.errors.name]} />
      </Field>
      <Field data-invalid={!!form.formState.errors.campaign_type}>
        <FieldLabel htmlFor="marketing-type">活动类型</FieldLabel>
        <Controller
          control={form.control}
          name="campaign_type"
          render={({ field }) => (
            <FormSelect
              id="marketing-type"
              value={field.value}
              options={campaignTypeOptions.map(([value, label]) => ({ value, label }))}
              onChange={field.onChange}
              disabled={mode === "edit"}
            />
          )}
        />
        <FieldError errors={[form.formState.errors.campaign_type]} />
      </Field>
      <Field data-invalid={!!form.formState.errors.status}>
        <FieldLabel htmlFor="marketing-status">活动状态</FieldLabel>
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormSelect
              id="marketing-status"
              value={field.value}
              options={campaignStatusOptions.map(([value, label]) => ({ value, label }))}
              onChange={field.onChange}
            />
          )}
        />
        <FieldError errors={[form.formState.errors.status]} />
      </Field>
      <Field>
        <FieldLabel htmlFor="marketing-enabled">是否启用</FieldLabel>
        <Controller
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormSelect
              id="marketing-enabled"
              value={field.value}
              options={booleanOptions}
              onChange={field.onChange}
            />
          )}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="marketing-valid-from">开始时间</FieldLabel>
        <Input id="marketing-valid-from" type="datetime-local" {...form.register("valid_from")} />
      </Field>
      <Field>
        <FieldLabel htmlFor="marketing-valid-until">结束时间</FieldLabel>
        <Input id="marketing-valid-until" type="datetime-local" {...form.register("valid_until")} />
      </Field>
    </FieldGroup>
  );
}

export function CampaignScopeFields({
  form,
  projectIds,
  projectKeyword,
  projectLoading,
  projectError,
  projectOptions,
  projectPagination,
  targetScopeType,
  canGoPrevProjectPage,
  canGoNextProjectPage,
  setProjectIds,
  setProjectKeyword,
  setProjectPage,
  setProjectReloadKey,
  toggleProject,
}: {
  form: UseFormReturn<CampaignFormValues>;
  projectIds: string[];
  projectKeyword: string;
  projectLoading: boolean;
  projectError: string;
  projectOptions: MarketingProjectOption[];
  projectPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  targetScopeType: CampaignFormValues["target_scope_type"];
  canGoPrevProjectPage: boolean;
  canGoNextProjectPage: boolean;
  setProjectIds: (projectIds: string[]) => void;
  setProjectKeyword: (keyword: string) => void;
  setProjectPage: (updater: number | ((page: number) => number)) => void;
  setProjectReloadKey: (updater: number | ((value: number) => number)) => void;
  toggleProject: (projectId: string, checked: boolean) => void;
}) {
  return (
    <>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="marketing-scope">项目范围</FieldLabel>
          <Controller
            control={form.control}
            name="target_scope_type"
            render={({ field }) => (
              <FormSelect
                id="marketing-scope"
                value={field.value}
                options={targetScopeOptions.map(([value, label]) => ({ value, label }))}
                onChange={(value) => {
                  field.onChange(value);
                  setProjectIds([]);
                }}
              />
            )}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="marketing-auto-close">到期自动关闭</FieldLabel>
          <Controller
            control={form.control}
            name="auto_close_on_expire"
            render={({ field }) => (
              <FormSelect
                id="marketing-auto-close"
                value={field.value}
                options={booleanOptions}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
      </FieldGroup>

      <MarketingProjectSelector
        targetScopeType={targetScopeType}
        projectIds={projectIds}
        projectKeyword={projectKeyword}
        projectLoading={projectLoading}
        projectError={projectError}
        projectOptions={projectOptions}
        projectPagination={projectPagination}
        canGoPrevProjectPage={canGoPrevProjectPage}
        canGoNextProjectPage={canGoNextProjectPage}
        setProjectKeyword={(value) => {
          setProjectKeyword(value);
          setProjectPage(1);
        }}
        setProjectPage={setProjectPage}
        setProjectReloadKey={setProjectReloadKey}
        toggleProject={toggleProject}
      />
    </>
  );
}

export function CampaignRuleFields({
  form,
  campaignType,
}: {
  form: UseFormReturn<CampaignFormValues>;
  campaignType: CampaignFormValues["campaign_type"];
}) {
  return (
    <FieldGroup className="grid gap-4 md:grid-cols-2">
      {campaignType === "share_assist" ? (
        <>
          <Field data-invalid={!!form.formState.errors.target_assist_count}>
            <FieldLabel htmlFor="marketing-target-count">目标助力人数</FieldLabel>
            <Input id="marketing-target-count" type="number" min={1} {...form.register("target_assist_count")} />
            <FieldError errors={[form.formState.errors.target_assist_count]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="marketing-allow-existing">允许已有活动时创建</FieldLabel>
            <Controller
              control={form.control}
              name="allow_create_when_existing_active"
              render={({ field }) => (
                <FormSelect
                  id="marketing-allow-existing"
                  value={field.value}
                  options={booleanOptions}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
        </>
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor="marketing-achievement">达成方式</FieldLabel>
            <Controller
              control={form.control}
              name="achievement_mode"
              render={({ field }) => (
                <FormSelect
                  id="marketing-achievement"
                  value={field.value}
                  options={achievementModeOptions}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="marketing-one-active">每客户只允许一个进行中活动</FieldLabel>
            <Controller
              control={form.control}
              name="allow_one_active_per_customer"
              render={({ field }) => (
                <FormSelect
                  id="marketing-one-active"
                  value={field.value}
                  options={booleanOptions}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
        </>
      )}
    </FieldGroup>
  );
}

export function CampaignRewardFields({ form }: { form: UseFormReturn<CampaignFormValues> }) {
  return (
    <>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="marketing-display-title">默认展示标题</FieldLabel>
          <Input id="marketing-display-title" {...form.register("default_display_title")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="marketing-display-subtitle">默认展示副标题</FieldLabel>
          <Input id="marketing-display-subtitle" {...form.register("default_display_subtitle")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="marketing-reward-title">奖励标题</FieldLabel>
          <Input id="marketing-reward-title" {...form.register("reward_title")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="marketing-reward-channel">领奖渠道</FieldLabel>
          <Input id="marketing-reward-channel" {...form.register("reward_claim_channel")} />
        </Field>
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor="marketing-reward-instruction">领奖说明</FieldLabel>
        <Textarea id="marketing-reward-instruction" rows={2} {...form.register("reward_claim_instruction")} />
      </Field>
      <Field>
        <FieldLabel htmlFor="marketing-reward-remark">奖励补充说明</FieldLabel>
        <Textarea id="marketing-reward-remark" rows={2} {...form.register("reward_remark")} />
      </Field>
    </>
  );
}
