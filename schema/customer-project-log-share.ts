import { z } from "zod";
import { PaginationQuerySchema } from "./request";

export const CustomerProjectLogShareParamsSchema = z.object({
  projectId: z.uuid("无效的项目ID"),
  logId: z.uuid("无效的日志ID"),
});

export const CustomerProjectLogShareProjectIdParamsSchema = z.object({
  projectId: z.uuid("无效的项目ID"),
});

export const CustomerProjectLogShareTokenParamsSchema = z.object({
  shareToken: z.string().trim().min(1, "无效的分享 token").max(100, "无效的分享 token"),
});

export const CustomerProjectLogShareCampaignIdParamsSchema = z.object({
  campaignId: z.uuid("无效的活动ID"),
});

export const CustomerProjectLogShareStyleSchema = z.enum(
  ["warm", "concise", "life"],
  {
    message: "无效的分享文案风格",
  },
);

export const CustomerProjectLogShareLengthSchema = z.enum(
  ["short", "medium"],
  {
    message: "无效的分享文案长度",
  },
);

export const CustomerProjectLogShareChannelSchema = z.enum(
  ["timeline"],
  {
    message: "无效的分享渠道",
  },
);

export const CustomerProjectLogShareSourceSchema = z.enum(
  ["qrcode", "poster"],
  {
    message: "无效的分享来源",
  },
);

export const CustomerProjectLogShareRewardClaimStatusSchema = z.enum(
  ["unclaimed", "pending", "claimed", "expired"],
  {
    message: "无效的领奖状态",
  },
);

export const CustomerProjectLogShareClaimChannelSchema = z.enum(
  ["store", "wechat", "phone"],
  {
    message: "无效的领奖渠道",
  },
);

export const GenerateCustomerProjectLogShareCopySchema = z.object({
  style: CustomerProjectLogShareStyleSchema.default("warm"),
  length: CustomerProjectLogShareLengthSchema.default("short"),
});

export const GetCustomerProjectLogShareCardQuerySchema = z.object({
  share_token: z.string().trim().max(100, "分享 token 过长").optional(),
});

export const CreateCustomerProjectLogShareCampaignSchema = z.object({
  channel: CustomerProjectLogShareChannelSchema.default("timeline"),
});

export const CustomerProjectLogShareRecordActionSchema = z.enum(
  ["generate_copy", "copy_text", "save_image"],
  {
    message: "无效的分享记录动作",
  },
);

export const CreateCustomerProjectLogShareRecordSchema = z.object({
  copy_id: z.string().trim().max(100, "文案 ID 过长").nullable().optional(),
  copy_text: z.string().trim().max(500, "文案内容过长").nullable().optional(),
  action: CustomerProjectLogShareRecordActionSchema,
});

export const OpenCustomerProjectLogShareCampaignSchema = z.object({
  share_token: z.string().trim().min(1, "无效的分享 token").max(100, "无效的分享 token"),
  source: CustomerProjectLogShareSourceSchema.default("qrcode"),
});

export const AssistCustomerProjectLogShareCampaignSchema = z.object({
  share_token: z.string().trim().min(1, "无效的分享 token").max(100, "无效的分享 token"),
  source: CustomerProjectLogShareSourceSchema.default("qrcode"),
});

export const CustomerProjectLogShareHelpersQuerySchema = PaginationQuerySchema;

export const ClaimCustomerProjectLogShareCampaignSchema = z.object({
  claim_code: z.string().trim().min(1, "领奖码不能为空").max(100, "领奖码过长"),
  channel: CustomerProjectLogShareClaimChannelSchema.default("store"),
  remark: z.string().trim().max(200, "备注过长").nullable().optional(),
});

export type CustomerProjectLogShareParams = z.infer<
  typeof CustomerProjectLogShareParamsSchema
>;
export type CustomerProjectLogShareProjectIdParams = z.infer<
  typeof CustomerProjectLogShareProjectIdParamsSchema
>;
export type CustomerProjectLogShareCampaignIdParams = z.infer<
  typeof CustomerProjectLogShareCampaignIdParamsSchema
>;
export type CustomerProjectLogShareTokenParams = z.infer<
  typeof CustomerProjectLogShareTokenParamsSchema
>;
export type GenerateCustomerProjectLogShareCopyInput = z.infer<
  typeof GenerateCustomerProjectLogShareCopySchema
>;
export type GetCustomerProjectLogShareCardQuery = z.infer<
  typeof GetCustomerProjectLogShareCardQuerySchema
>;
export type CreateCustomerProjectLogShareCampaignInput = z.infer<
  typeof CreateCustomerProjectLogShareCampaignSchema
>;
export type CreateCustomerProjectLogShareRecordInput = z.infer<
  typeof CreateCustomerProjectLogShareRecordSchema
>;
export type OpenCustomerProjectLogShareCampaignInput = z.infer<
  typeof OpenCustomerProjectLogShareCampaignSchema
>;
export type AssistCustomerProjectLogShareCampaignInput = z.infer<
  typeof AssistCustomerProjectLogShareCampaignSchema
>;
export type CustomerProjectLogShareHelpersQuery = z.infer<
  typeof CustomerProjectLogShareHelpersQuerySchema
>;
export type ClaimCustomerProjectLogShareCampaignInput = z.infer<
  typeof ClaimCustomerProjectLogShareCampaignSchema
>;
