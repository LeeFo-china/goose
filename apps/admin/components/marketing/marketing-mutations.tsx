"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import {
  Eye,
  Loader2,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  XCircle,
} from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  campaignStatusOptions,
  campaignTypeOptions,
  targetScopeOptions,
} from "@/components/marketing/marketing-constants";
import type {
  MarketingCampaignDetail,
  MarketingCampaignRecord,
  MarketingCampaignStatus,
  MarketingCampaignType,
  MarketingProjectOption,
} from "@/components/marketing/marketing-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const booleanOptions = [
  { value: "true", label: "是" },
  { value: "false", label: "否" },
] as const;

const achievementModeOptions = [
  { value: "appointment_submit", label: "提交预约即达成" },
  { value: "store_checkin", label: "到店确认后达成" },
] as const;

const CampaignFormSchema = z.object({
  name: z.string().trim().min(1, "活动名称不能为空").max(100, "活动名称过长"),
  campaign_type: z.enum(["share_assist", "appointment_reward"]),
  status: z.enum(["draft", "active", "paused", "closed"]),
  enabled: z.enum(["true", "false"]),
  target_scope_type: z.enum(["all_projects", "project_list"]),
  valid_from: z.string(),
  valid_until: z.string(),
  auto_close_on_expire: z.enum(["true", "false"]),
  reward_title: z.string().max(100, "奖励标题过长"),
  reward_remark: z.string().max(200, "奖励说明过长"),
  reward_claim_instruction: z.string().max(200, "领奖说明过长"),
  reward_claim_channel: z.string().max(50, "领奖渠道过长"),
  target_assist_count: z.string().refine((value) => {
    const count = Number(value);
    return Number.isInteger(count) && count >= 1;
  }, "目标助力人数必须大于 0"),
  allow_create_when_existing_active: z.enum(["true", "false"]),
  achievement_mode: z.enum(["appointment_submit", "store_checkin"]),
  allow_one_active_per_customer: z.enum(["true", "false"]),
  default_display_title: z.string().max(100, "展示标题过长"),
  default_display_subtitle: z.string().max(100, "展示副标题过长"),
});

type CampaignFormValues = z.infer<typeof CampaignFormSchema>;

const defaultValues: CampaignFormValues = {
  name: "",
  campaign_type: "share_assist",
  status: "draft",
  enabled: "true",
  target_scope_type: "all_projects",
  valid_from: "",
  valid_until: "",
  auto_close_on_expire: "true",
  reward_title: "",
  reward_remark: "",
  reward_claim_instruction: "",
  reward_claim_channel: "",
  target_assist_count: "3",
  allow_create_when_existing_active: "false",
  achievement_mode: "appointment_submit",
  allow_one_active_per_customer: "true",
  default_display_title: "",
  default_display_subtitle: "",
};

const statusLabel = Object.fromEntries(campaignStatusOptions);
const typeLabel = Object.fromEntries(campaignTypeOptions);
const scopeLabel = Object.fromEntries(targetScopeOptions);

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestMarketing<T>(input: {
  path: string;
  method?: "GET" | "POST" | "PUT";
  payload?: unknown;
}) {
  const response = await fetch(`/api/backend${input.path}`, {
    method: input.method || "GET",
    headers: input.payload ? { "content-type": "application/json" } : undefined,
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }
  return payload.data as T;
}

function toDatetimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function toIsoOrNull(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function buildDefaults(campaign?: MarketingCampaignDetail | null): CampaignFormValues {
  if (!campaign) return defaultValues;
  const config = campaign.config_payload || {};
  const campaignType = campaign.campaign_type;

  return {
    name: campaign.name || "",
    campaign_type: campaignType,
    status: campaign.status,
    enabled: String(campaign.enabled) as "true" | "false",
    target_scope_type: campaign.target_scope_type,
    valid_from: toDatetimeLocal(campaign.valid_from),
    valid_until: toDatetimeLocal(campaign.valid_until),
    auto_close_on_expire: String(campaign.auto_close_on_expire) as "true" | "false",
    reward_title: campaign.reward_title || "",
    reward_remark: campaign.reward_remark || "",
    reward_claim_instruction: campaign.reward_claim_instruction || "",
    reward_claim_channel: campaign.reward_claim_channel || "",
    target_assist_count: String(Number(config.target_assist_count || 3)),
    allow_create_when_existing_active: String(
      booleanValue(config.allow_create_when_existing_active, false),
    ) as "true" | "false",
    achievement_mode: stringValue(config.achievement_mode) === "store_checkin"
      ? "store_checkin"
      : "appointment_submit",
    allow_one_active_per_customer: String(
      booleanValue(config.allow_one_active_per_customer, true),
    ) as "true" | "false",
    default_display_title: stringValue(config.default_display_title),
    default_display_subtitle: stringValue(config.default_display_subtitle),
  };
}

function projectHint(project: MarketingProjectOption) {
  return [project.status, project.address].filter(Boolean).join(" · ");
}

function buildCampaignPayload(values: CampaignFormValues, projectIds: string[]) {
  const campaignType = values.campaign_type as MarketingCampaignType;
  const targetScopeType = values.target_scope_type;
  const configPayload = campaignType === "appointment_reward"
    ? {
      achievement_mode: values.achievement_mode,
      allow_one_active_per_customer: values.allow_one_active_per_customer === "true",
      default_display_title: values.default_display_title.trim() || null,
      default_display_subtitle: values.default_display_subtitle.trim() || null,
    }
    : {
      target_assist_count: Number(values.target_assist_count),
      allow_create_when_existing_active: values.allow_create_when_existing_active === "true",
      default_display_title: values.default_display_title.trim() || null,
      default_display_subtitle: values.default_display_subtitle.trim() || null,
    };

  return {
    campaign_type: campaignType,
    name: values.name.trim(),
    enabled: values.enabled === "true",
    status: values.status,
    target_scope_type: targetScopeType,
    valid_from: toIsoOrNull(values.valid_from),
    valid_until: toIsoOrNull(values.valid_until),
    auto_close_on_expire: values.auto_close_on_expire === "true",
    reward_title: values.reward_title.trim() || null,
    reward_remark: values.reward_remark.trim() || null,
    reward_claim_instruction: values.reward_claim_instruction.trim() || null,
    reward_claim_channel: values.reward_claim_channel.trim() || null,
    include_project_ids: targetScopeType === "project_list" ? projectIds : [],
    exclude_project_ids: targetScopeType === "all_projects" ? projectIds : [],
    config_payload: configPayload,
  };
}

function CampaignFormDialog({
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
    setError("");
  }, [campaign, form, open]);

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
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    });
  }

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

          <Field>
            <FieldLabel>
              {targetScopeType === "project_list" ? "包含项目" : "排除项目"}
            </FieldLabel>
            <div className="max-h-44 overflow-y-auto rounded-md border bg-muted/20 p-3">
              {projects.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {projects.map((project) => (
                    <label
                      key={project.id}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={projectIds.includes(project.id)}
                        onChange={(event) => toggleProject(project.id, event.target.checked)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {project.name || project.id}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {projectHint(project) || "无项目备注"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">暂无可选项目</div>
              )}
            </div>
            <FieldDescription>
              全部项目模式下勾选的是排除项目；指定项目模式下勾选的是可参与项目。
            </FieldDescription>
          </Field>

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

function CampaignDetailDialog({
  open,
  campaign,
  onOpenChange,
}: {
  open: boolean;
  campaign: MarketingCampaignDetail | null;
  onOpenChange: (open: boolean) => void;
}) {
  const scopes = campaign?.scopes || [];
  const configEntries = Object.entries(campaign?.config_payload || {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{campaign?.name || "营销活动详情"}</DialogTitle>
          <DialogDescription>
            活动配置、项目范围和实例统计。
          </DialogDescription>
        </DialogHeader>
        {campaign ? (
          <div className="space-y-5 text-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">活动类型</div>
                <div className="mt-1 font-medium">{typeLabel[campaign.campaign_type]}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">状态</div>
                <div className="mt-1 font-medium">{statusLabel[campaign.status]}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">实例数</div>
                <div className="mt-1 font-medium">{campaign.summary?.instance_count || 0}</div>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>项目范围：{scopeLabel[campaign.target_scope_type]}</div>
              <div>启用：{campaign.enabled ? "是" : "否"}</div>
              <div>奖励标题：{campaign.reward_title || "-"}</div>
              <div>领奖渠道：{campaign.reward_claim_channel || "-"}</div>
            </div>
            <div>
              <div className="mb-2 font-medium">项目范围明细</div>
              {scopes.length ? (
                <div className="flex flex-wrap gap-2">
                  {scopes.map((scope) => (
                    <Badge key={`${scope.scope_mode}-${scope.project_id}`} variant="outline">
                      {scope.scope_mode === "include" ? "包含" : "排除"} · {scope.project_name || scope.project_id}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">无单独项目限制</div>
              )}
            </div>
            <div>
              <div className="mb-2 font-medium">配置参数</div>
              <div className="rounded-md border bg-muted/30 p-3">
                {configEntries.length ? (
                  configEntries.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[190px_1fr] gap-2 py-1">
                      <span className="text-muted-foreground">{key}</span>
                      <span className="break-all">{String(value ?? "-")}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground">无配置参数</div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function CreateMarketingCampaignButton({
  projects,
}: {
  projects: MarketingProjectOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        新建活动
      </Button>
      <CampaignFormDialog
        open={open}
        mode="create"
        projects={projects}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function MarketingRowActions({
  campaign,
  projects,
}: {
  campaign: MarketingCampaignRecord;
  projects: MarketingProjectOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<MarketingCampaignDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState("");

  const nextStatus = useMemo<MarketingCampaignStatus | null>(() => {
    if (campaign.status === "active") return "paused";
    if (campaign.status === "draft" || campaign.status === "paused") return "active";
    return null;
  }, [campaign.status]);

  async function loadDetail() {
    if (detail) return detail;
    const data = await requestMarketing<MarketingCampaignDetail>({
      path: `/employee/marketing-center/campaigns/${campaign.id}`,
    });
    setDetail(data);
    return data;
  }

  function openDetail() {
    setError("");
    startTransition(async () => {
      try {
        await loadDetail();
        setDetailOpen(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "详情加载失败");
      }
    });
  }

  function openEdit() {
    setError("");
    startTransition(async () => {
      try {
        await loadDetail();
        setEditOpen(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "详情加载失败");
      }
    });
  }

  function updateStatus(status: MarketingCampaignStatus) {
    setError("");
    startTransition(async () => {
      try {
        await requestMarketing({
          path: `/employee/marketing-center/campaigns/${campaign.id}/status`,
          method: "POST",
          payload: { status },
        });
        setDetail(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "状态更新失败");
      }
    });
  }

  return (
    <div className="space-y-2">
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={openDetail}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
          详情
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={openEdit}>
          <Pencil data-icon="inline-start" />
          编辑
        </Button>
        {nextStatus ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => updateStatus(nextStatus)}
          >
            {nextStatus === "active" ? <PlayCircle data-icon="inline-start" /> : <PauseCircle data-icon="inline-start" />}
            {nextStatus === "active" ? "启用" : "暂停"}
          </Button>
        ) : null}
        {campaign.status !== "closed" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => updateStatus("closed")}
          >
            <XCircle data-icon="inline-start" />
            关闭
          </Button>
        ) : null}
      </div>
      <CampaignDetailDialog
        open={detailOpen}
        campaign={detail}
        onOpenChange={setDetailOpen}
      />
      <CampaignFormDialog
        open={editOpen}
        mode="edit"
        campaign={detail}
        projects={projects}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
