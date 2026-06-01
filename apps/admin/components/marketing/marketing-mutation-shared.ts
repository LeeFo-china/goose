import { z } from "zod";
import { campaignStatusOptions, campaignTypeOptions, targetScopeOptions } from "@/components/marketing/marketing-constants";
import type { MarketingCampaignDetail, MarketingCampaignType, MarketingProjectOption } from "@/components/marketing/marketing-types";
import { requestBackendJson } from "@/lib/backend-client";

export const booleanOptions = [
  { value: "true", label: "是" },
  { value: "false", label: "否" },
] as const;

export const achievementModeOptions = [
  { value: "appointment_submit", label: "提交预约即达成" },
  { value: "store_checkin", label: "到店确认后达成" },
] as const;
export const PROJECT_SELECTOR_PAGE_SIZE = 8;

export const CampaignFormSchema = z.object({
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

export type CampaignFormValues = z.infer<typeof CampaignFormSchema>;

export type ProjectOptionPayload = {
  id: string;
  name?: string | null;
  title?: string | null;
  status?: string | null;
  address?: string | null;
  subtitle?: string | null;
};

export type ProjectOptionsData = {
  list: ProjectOptionPayload[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export const defaultValues: CampaignFormValues = {
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

export const statusLabel = Object.fromEntries(campaignStatusOptions);
export const typeLabel = Object.fromEntries(campaignTypeOptions);
export const scopeLabel = Object.fromEntries(targetScopeOptions);

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function requestMarketing<T>(input: {
  path: string;
  method?: "GET" | "POST" | "PUT";
  payload?: unknown;
}) {
  return requestBackendJson<T>(input.path, {
    method: input.method || "GET",
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
}

export function toDatetimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function toIsoOrNull(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function buildDefaults(campaign?: MarketingCampaignDetail | null): CampaignFormValues {
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

export function projectHint(project: MarketingProjectOption) {
  return [project.status, project.address].filter(Boolean).join(" · ");
}

export function normalizeProjectOption(project: ProjectOptionPayload): MarketingProjectOption {
  return {
    id: project.id,
    name: project.name || project.title || project.id,
    status: project.status || null,
    address: project.address || project.subtitle || null,
  };
}

export function buildCampaignPayload(values: CampaignFormValues, projectIds: string[]) {
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
