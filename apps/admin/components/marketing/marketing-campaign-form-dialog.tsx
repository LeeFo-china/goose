"use client";

import { useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { campaignStatusOptions, campaignTypeOptions, targetScopeOptions } from "@/components/marketing/marketing-constants";
import type { MarketingCampaignDetail, MarketingProjectOption } from "@/components/marketing/marketing-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import { MarketingProjectSelector } from "@/components/marketing/marketing-project-selector";
import { achievementModeOptions, booleanOptions, buildCampaignPayload, buildDefaults, CampaignFormSchema, defaultValues, normalizeProjectOption, PROJECT_SELECTOR_PAGE_SIZE, requestMarketing, type CampaignFormValues, type ProjectOptionsData } from "@/components/marketing/marketing-mutation-shared";

export function CampaignFormDialog({
  open,
  mode,
  campaign,
  projects,
  onOpenChange,
}: {
  open: boolean;
  mode: "create" | "edit";
  campaign?: MarketingCampaignDetail | null;
  projects: MarketingProjectOption[];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [projectKeyword, setProjectKeyword] = useState("");
  const [projectPage, setProjectPage] = useState(1);
  const [projectOptions, setProjectOptions] = useState<MarketingProjectOption[]>(projects);
  const [projectPagination, setProjectPagination] = useState({
    page: 1,
    pageSize: PROJECT_SELECTOR_PAGE_SIZE,
    total: projects.length,
    totalPages: projects.length ? 1 : 0,
  });
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [projectReloadKey, setProjectReloadKey] = useState(0);
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(CampaignFormSchema as never) as Resolver<CampaignFormValues>,
    defaultValues,
  });
  const campaignType = form.watch("campaign_type");
  const targetScopeType = form.watch("target_scope_type");
  const title = mode === "create" ? "新建营销活动" : "编辑营销活动";

  useEffect(() => {
    if (!open) return;
    const defaults = buildDefaults(campaign);
    form.reset(defaults);
    setProjectIds(
      defaults.target_scope_type === "project_list"
        ? campaign?.include_project_ids || []
        : campaign?.exclude_project_ids || [],
    );
    setProjectKeyword("");
    setProjectPage(1);
    setProjectOptions(projects);
    setProjectPagination({
      page: 1,
      pageSize: PROJECT_SELECTOR_PAGE_SIZE,
      total: projects.length,
      totalPages: projects.length ? 1 : 0,
    });
    setProjectError("");
    setProjectReloadKey((value) => value + 1);
    setError("");
  }, [campaign, form, open, projects]);

  useEffect(() => {
    if (!open) return;

    let ignore = false;
    const timer = window.setTimeout(async () => {
      const query = new URLSearchParams({
        page: String(projectPage),
        pageSize: String(PROJECT_SELECTOR_PAGE_SIZE),
      });
      if (projectKeyword.trim()) {
        query.set("keyword", projectKeyword.trim());
      }

      setProjectLoading(true);
      setProjectError("");
      try {
        const data = await requestMarketing<ProjectOptionsData>({
          path: `/marketing-pages/project-options?${query.toString()}`,
        });
        if (ignore) return;
        setProjectOptions((data?.list || []).map(normalizeProjectOption));
        setProjectPagination(data?.pagination || {
          page: projectPage,
          pageSize: PROJECT_SELECTOR_PAGE_SIZE,
          total: 0,
          totalPages: 0,
        });
      } catch (err) {
        if (ignore) return;
        setProjectOptions([]);
        setProjectPagination({
          page: projectPage,
          pageSize: PROJECT_SELECTOR_PAGE_SIZE,
          total: 0,
          totalPages: 0,
        });
        setProjectError(err instanceof Error ? err.message : "项目加载失败");
      } finally {
        if (!ignore) {
          setProjectLoading(false);
        }
      }
    }, projectKeyword ? 300 : 0);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [open, projectKeyword, projectPage, projectReloadKey]);

  function toggleProject(projectId: string, checked: boolean) {
    setProjectIds((current) =>
      checked
        ? Array.from(new Set([...current, projectId]))
        : current.filter((id) => id !== projectId)
    );
  }

  function submit(values: CampaignFormValues) {
    if (values.target_scope_type === "project_list" && projectIds.length === 0) {
      setError("指定项目范围至少要选择 1 个项目");
      return;
    }

    const payload = buildCampaignPayload(values, projectIds);
    setError("");
    startTransition(async () => {
      try {
        if (mode === "create") {
          await requestMarketing({
            path: "/employee/marketing-center/campaigns",
            method: "POST",
            payload,
          });
        } else if (campaign?.id) {
          await requestMarketing({
            path: `/employee/marketing-center/campaigns/${campaign.id}`,
            method: "PUT",
            payload,
          });
        }
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    });
  }

  const canGoPrevProjectPage = projectPagination.page > 1 && !projectLoading;
  const canGoNextProjectPage = (
    projectPagination.totalPages > 0
    && projectPagination.page < projectPagination.totalPages
    && !projectLoading
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            配置营销活动的类型、有效期、奖励信息和可参与项目范围。
          </DialogDescription>
        </DialogHeader>
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
