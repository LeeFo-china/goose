import { z } from "zod";
import { PaginationQuerySchema } from "./request";

export const MarketingCampaignTypeSchema = z.enum(["share_assist", "appointment_reward"], {
  message: "无效的活动类型",
});

export const MarketingCampaignStatusSchema = z.enum(
  ["draft", "active", "paused", "closed"],
  { message: "无效的活动状态" },
);

export const MarketingCampaignTemplateStatusSchema = z.enum(
  ["draft", "active", "disabled"],
  { message: "无效的模板状态" },
);

export const MarketingCampaignTargetScopeTypeSchema = z.enum(
  ["all_projects", "project_list"],
  { message: "无效的活动范围类型" },
);

export const AppointmentRewardAchievementModeSchema = z.enum(
  ["appointment_submit", "store_checkin"],
  { message: "无效的预约奖励达成方式" },
);

export const MarketingCampaignIdParamsSchema = z.object({
  campaignId: z.uuid("无效的活动ID"),
});

export const MarketingCampaignInstanceIdParamsSchema = z.object({
  instanceId: z.uuid("无效的活动实例ID"),
});

export const MarketingCampaignTemplateIdParamsSchema = z.object({
  templateId: z.uuid("无效的模板ID"),
});

export const ShareAssistConfigPayloadSchema = z.object({
  target_assist_count: z.number().int("目标助力人数必须为整数").min(1, "目标助力人数不能小于 1"),
  allow_create_when_existing_active: z.boolean().default(false),
  default_display_title: z.string().trim().max(100, "展示标题过长").nullable().optional(),
  default_display_subtitle: z.string().trim().max(100, "展示副标题过长").nullable().optional(),
});

export const AppointmentRewardConfigPayloadSchema = z.object({
  achievement_mode: AppointmentRewardAchievementModeSchema,
  allow_one_active_per_customer: z.boolean().default(true),
  default_display_title: z.string().trim().max(100, "展示标题过长").nullable().optional(),
  default_display_subtitle: z.string().trim().max(100, "展示副标题过长").nullable().optional(),
});

export const MarketingCampaignConfigPayloadSchema = z.record(z.string(), z.unknown());

function validateCampaignConfigPayload(
  campaignType: z.infer<typeof MarketingCampaignTypeSchema>,
  payload: Record<string, unknown> | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[] = ["config_payload"],
) {
  if (!payload) {
    ctx.addIssue({
      code: "custom",
      path,
      message: "缺少活动配置",
    });
    return;
  }

  const result = campaignType === "share_assist"
    ? ShareAssistConfigPayloadSchema.safeParse(payload)
    : AppointmentRewardConfigPayloadSchema.safeParse(payload);

  if (result.success) {
    return;
  }

  const firstIssue = result.error.issues[0];
  ctx.addIssue({
    code: "custom",
    path: [...path, ...(firstIssue?.path || [])],
    message: firstIssue?.message || "活动配置不合法",
  });
}

const MarketingCampaignUpsertBaseSchema = z.object({
  campaign_type: MarketingCampaignTypeSchema,
  name: z.string().trim().min(1, "活动名称不能为空").max(100, "活动名称过长"),
  enabled: z.boolean(),
  status: MarketingCampaignStatusSchema,
  target_scope_type: MarketingCampaignTargetScopeTypeSchema,
  valid_from: z.iso.datetime({ offset: true, local: true }).nullable().optional(),
  valid_until: z.iso.datetime({ offset: true, local: true }).nullable().optional(),
  auto_close_on_expire: z.boolean().default(true),
  reward_title: z.string().trim().max(100, "奖励标题过长").nullable().optional(),
  reward_remark: z.string().trim().max(200, "奖励补充说明过长").nullable().optional(),
  reward_claim_instruction: z.string().trim().max(200, "领奖说明过长").nullable().optional(),
  reward_claim_channel: z.string().trim().max(50, "领奖渠道过长").nullable().optional(),
  exclude_project_ids: z.array(z.uuid("无效的项目ID")).max(500, "排除项目过多").default([]),
  include_project_ids: z.array(z.uuid("无效的项目ID")).max(500, "包含项目过多").default([]),
  config_payload: MarketingCampaignConfigPayloadSchema,
}).superRefine((input, ctx) => {
  validateCampaignConfigPayload(input.campaign_type, input.config_payload, ctx);
});

export const MarketingCampaignUpsertSchema = MarketingCampaignUpsertBaseSchema;

export const CreateMarketingCampaignSchema = z.object({
  campaign_type: MarketingCampaignTypeSchema,
  template_id: z.uuid("无效的模板ID").optional(),
  name: z.string().trim().min(1, "活动名称不能为空").max(100, "活动名称过长").optional(),
  enabled: z.boolean().optional(),
  status: MarketingCampaignStatusSchema.optional(),
  target_scope_type: MarketingCampaignTargetScopeTypeSchema.optional(),
  valid_from: z.iso.datetime({ offset: true, local: true }).nullable().optional(),
  valid_until: z.iso.datetime({ offset: true, local: true }).nullable().optional(),
  auto_close_on_expire: z.boolean().optional(),
  reward_title: z.string().trim().max(100, "奖励标题过长").nullable().optional(),
  reward_remark: z.string().trim().max(200, "奖励补充说明过长").nullable().optional(),
  reward_claim_instruction: z.string().trim().max(200, "领奖说明过长").nullable().optional(),
  reward_claim_channel: z.string().trim().max(50, "领奖渠道过长").nullable().optional(),
  exclude_project_ids: z.array(z.uuid("无效的项目ID")).max(500, "排除项目过多").default([]),
  include_project_ids: z.array(z.uuid("无效的项目ID")).max(500, "包含项目过多").default([]),
  config_payload: MarketingCampaignConfigPayloadSchema.optional(),
}).superRefine((input, ctx) => {
  if (!input.template_id) {
    if (!input.name) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "活动名称不能为空" });
    }
    if (typeof input.enabled !== "boolean") {
      ctx.addIssue({ code: "custom", path: ["enabled"], message: "缺少活动启用状态" });
    }
    if (!input.status) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "缺少活动状态" });
    }
    if (!input.target_scope_type) {
      ctx.addIssue({ code: "custom", path: ["target_scope_type"], message: "缺少活动范围类型" });
    }
    validateCampaignConfigPayload(input.campaign_type, input.config_payload, ctx);
    return;
  }

  if (input.config_payload) {
    validateCampaignConfigPayload(input.campaign_type, input.config_payload, ctx);
  }
});

export const UpdateMarketingCampaignSchema = MarketingCampaignUpsertBaseSchema;

const MarketingCampaignTemplateBaseSchema = z.object({
  campaign_type: MarketingCampaignTypeSchema,
  name: z.string().trim().min(1, "模板名称不能为空").max(100, "模板名称过长"),
  description: z.string().trim().max(200, "模板描述过长").nullable().optional(),
  status: MarketingCampaignTemplateStatusSchema,
  enabled: z.boolean(),
  is_builtin: z.boolean(),
  default_target_scope_type: MarketingCampaignTargetScopeTypeSchema,
  reward_title: z.string().trim().max(100, "奖励标题过长").nullable().optional(),
  reward_remark: z.string().trim().max(200, "奖励补充说明过长").nullable().optional(),
  reward_claim_instruction: z.string().trim().max(200, "领奖说明过长").nullable().optional(),
  reward_claim_channel: z.string().trim().max(50, "领奖渠道过长").nullable().optional(),
  config_payload: MarketingCampaignConfigPayloadSchema,
}).superRefine((input, ctx) => {
  validateCampaignConfigPayload(input.campaign_type, input.config_payload, ctx);
});

export const CreateMarketingCampaignTemplateSchema = MarketingCampaignTemplateBaseSchema;
export const UpdateMarketingCampaignTemplateSchema = MarketingCampaignTemplateBaseSchema;

export const MarketingCampaignStatusUpdateSchema = z.object({
  status: MarketingCampaignStatusSchema,
});

export const MarketingCampaignTemplateStatusUpdateSchema = z.object({
  status: MarketingCampaignTemplateStatusSchema,
});

export const MarketingCampaignListQuerySchema = PaginationQuerySchema.extend({
  campaign_type: MarketingCampaignTypeSchema.optional(),
  status: MarketingCampaignStatusSchema.optional(),
  keyword: z.string().trim().max(100, "关键词过长").optional(),
});

export const MarketingCampaignTemplateListQuerySchema = PaginationQuerySchema.extend({
  campaign_type: MarketingCampaignTypeSchema.optional(),
  status: MarketingCampaignTemplateStatusSchema.optional(),
  keyword: z.string().trim().max(100, "关键词过长").optional(),
});

export const MarketingCampaignInstanceStatusSchema = z.enum(
  ["active", "achieved", "reward_claimed", "closed"],
  {
    message: "无效的活动实例状态",
  },
);

export const MarketingCampaignRewardClaimStatusSchema = z.enum(
  ["unclaimed", "pending", "claimed", "expired"],
  {
    message: "无效的领奖状态",
  },
);

export const MarketingCampaignInstanceListQuerySchema = PaginationQuerySchema.extend({
  status: MarketingCampaignInstanceStatusSchema.optional(),
  rewardClaimStatus: MarketingCampaignRewardClaimStatusSchema.optional(),
  keyword: z.string().trim().max(100, "关键词过长").optional(),
  dateFrom: z.iso.datetime({ offset: true, local: true }).optional(),
  dateTo: z.iso.datetime({ offset: true, local: true }).optional(),
});

export type MarketingCampaignIdParams = z.infer<typeof MarketingCampaignIdParamsSchema>;
export type MarketingCampaignInstanceIdParams = z.infer<typeof MarketingCampaignInstanceIdParamsSchema>;
export type MarketingCampaignTemplateIdParams = z.infer<typeof MarketingCampaignTemplateIdParamsSchema>;
export type CreateMarketingCampaignInput = z.infer<typeof CreateMarketingCampaignSchema>;
export type UpdateMarketingCampaignInput = z.infer<typeof UpdateMarketingCampaignSchema>;
export type MarketingCampaignUpsertInput = z.infer<typeof MarketingCampaignUpsertSchema>;
export type MarketingCampaignStatusUpdateInput = z.infer<typeof MarketingCampaignStatusUpdateSchema>;
export type MarketingCampaignListQuery = z.infer<typeof MarketingCampaignListQuerySchema>;
export type MarketingCampaignInstanceListQuery = z.infer<typeof MarketingCampaignInstanceListQuerySchema>;
export type CreateMarketingCampaignTemplateInput = z.infer<typeof CreateMarketingCampaignTemplateSchema>;
export type UpdateMarketingCampaignTemplateInput = z.infer<typeof UpdateMarketingCampaignTemplateSchema>;
export type MarketingCampaignTemplateStatusUpdateInput = z.infer<typeof MarketingCampaignTemplateStatusUpdateSchema>;
export type MarketingCampaignTemplateListQuery = z.infer<typeof MarketingCampaignTemplateListQuerySchema>;
export type ShareAssistConfigPayload = z.infer<typeof ShareAssistConfigPayloadSchema>;
export type AppointmentRewardConfigPayload = z.infer<typeof AppointmentRewardConfigPayloadSchema>;
