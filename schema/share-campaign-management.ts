import { z } from "zod";
import { PaginationQuerySchema } from "./request";

export const EmployeeProjectShareCampaignConfigParamsSchema = z.object({
  projectId: z.uuid("无效的项目ID"),
});

export const ShareCampaignManagementCampaignIdParamsSchema = z.object({
  campaignId: z.uuid("无效的活动ID"),
});

export const ShareCampaignConfigStatusSchema = z.enum(
  ["draft", "active", "paused", "closed"],
  { message: "无效的配置状态" },
);

export const ShareCampaignConfigModeSchema = z.enum(
  ["inherit", "custom"],
  { message: "无效的配置模式" },
);

export const ShareCampaignInstanceStatusSchema = z.enum(
  ["active", "achieved", "reward_claimed", "closed"],
  { message: "无效的活动状态" },
);

export const ShareCampaignClosedReasonSchema = z.enum(
  ["manual_close", "expired", "system_close"],
  { message: "无效的关闭原因" },
);

export const PutProjectShareCampaignConfigSchema = z.object({
  enabled: z.boolean(),
  config_status: ShareCampaignConfigStatusSchema,
  config_mode: ShareCampaignConfigModeSchema.default("custom"),
  template_id: z.uuid("无效的模板ID").nullable().optional(),
  target_assist_count: z.number().int("目标助力人数必须为整数").min(1, "目标助力人数不能小于 1"),
  reward_title: z.string().trim().max(100, "奖励标题过长").nullable().optional(),
  reward_remark: z.string().trim().max(200, "奖励补充说明过长").nullable().optional(),
  reward_claim_instruction: z.string().trim().max(200, "领奖说明过长").nullable().optional(),
  reward_claim_channel: z.string().trim().max(50, "领奖渠道过长").nullable().optional(),
  valid_from: z.iso.datetime({ offset: true, local: true }).nullable().optional(),
  valid_until: z.iso.datetime({ offset: true, local: true }).nullable().optional(),
  auto_close_on_expire: z.boolean().default(true),
  allow_create_when_existing_active: z.boolean().default(false),
  default_display_title: z.string().trim().max(100, "展示标题过长").nullable().optional(),
  default_display_subtitle: z.string().trim().max(100, "展示副标题过长").nullable().optional(),
});

export const PostProjectShareCampaignConfigStatusSchema = z.object({
  config_status: ShareCampaignConfigStatusSchema,
});

export const EmployeeShareCampaignListQuerySchema = PaginationQuerySchema.extend({
  projectId: z.uuid("无效的项目ID").optional(),
  customerId: z.uuid("无效的客户ID").optional(),
  status: ShareCampaignInstanceStatusSchema.optional(),
  rewardClaimStatus: z.enum(["unclaimed", "pending", "claimed", "expired"], {
    message: "无效的领奖状态",
  }).optional(),
  keyword: z.string().trim().max(100, "关键词过长").optional(),
  dateFrom: z.iso.datetime({ offset: true, local: true }).optional(),
  dateTo: z.iso.datetime({ offset: true, local: true }).optional(),
});

export const PostEmployeeShareCampaignStatusSchema = z.object({
  status: z.enum(["closed"], { message: "当前仅支持关闭活动" }),
  reason: ShareCampaignClosedReasonSchema.default("manual_close"),
});

export const EmployeeShareCampaignStatsSummaryQuerySchema = z.object({
  projectId: z.uuid("无效的项目ID").optional(),
  dateFrom: z.iso.datetime({ offset: true, local: true }).optional(),
  dateTo: z.iso.datetime({ offset: true, local: true }).optional(),
});

export type EmployeeProjectShareCampaignConfigParams = z.infer<
  typeof EmployeeProjectShareCampaignConfigParamsSchema
>;
export type ShareCampaignManagementCampaignIdParams = z.infer<
  typeof ShareCampaignManagementCampaignIdParamsSchema
>;
export type PutProjectShareCampaignConfigInput = z.infer<
  typeof PutProjectShareCampaignConfigSchema
>;
export type PostProjectShareCampaignConfigStatusInput = z.infer<
  typeof PostProjectShareCampaignConfigStatusSchema
>;
export type EmployeeShareCampaignListQuery = z.infer<
  typeof EmployeeShareCampaignListQuerySchema
>;
export type PostEmployeeShareCampaignStatusInput = z.infer<
  typeof PostEmployeeShareCampaignStatusSchema
>;
export type EmployeeShareCampaignStatsSummaryQuery = z.infer<
  typeof EmployeeShareCampaignStatsSummaryQuerySchema
>;
