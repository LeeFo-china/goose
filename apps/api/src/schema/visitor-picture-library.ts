import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

const BooleanQuerySchema = z.preprocess((value) => {
  if (value == null || value === "") return false;
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return value;
}, z.boolean().default(false));

export const VisitorPictureAssetListQuerySchema = PaginationQuerySchema.extend({
  category_id: z.uuid("无效的分类 ID").optional(),
  debug_timing: BooleanQuerySchema.optional().default(false),
});

export const VisitorPictureCategoryListQuerySchema = z.object({
  debug_timing: BooleanQuerySchema.optional().default(false),
});

export const VisitorPictureAssetParamsSchema = z.object({
  id: z.uuid("无效的图片 ID"),
});

export const VisitorPictureAssetNavigationQuerySchema = z.object({
  category_id: z.uuid("无效的分类 ID").optional(),
  direction: z.enum(["prev", "next", "both"], {
    message: "无效的导航方向",
  }).optional().default("both"),
  limit: z.coerce.number()
    .int("导航数量必须是整数")
    .min(1, "导航数量必须大于 0")
    .max(5, "当前每个方向最多返回 5 张")
    .optional()
    .default(1),
  debug_timing: BooleanQuerySchema.optional().default(false),
});

export const VisitorPictureCommentListQuerySchema = PaginationQuerySchema.extend({
  debug_timing: BooleanQuerySchema.optional().default(false),
});

export const CreateVisitorPictureCommentSchema = z.object({
  content: z.string()
    .trim()
    .min(1, "请输入评论内容")
    .max(500, "评论内容不能超过 500 个字符"),
  image_file_ids: z.array(z.uuid("无效的评论图片 ID"))
    .max(3, "评论图片最多 3 张")
    .optional()
    .default([]),
});

export const CreateVisitorPictureShareEventSchema = z.object({
  channel: z.enum(["wechat_session", "wechat_timeline", "poster"], {
    message: "无效的分享渠道",
  }),
});

export type VisitorPictureAssetListQuery = z.infer<typeof VisitorPictureAssetListQuerySchema>;
export type VisitorPictureCategoryListQuery = z.infer<typeof VisitorPictureCategoryListQuerySchema>;
export type VisitorPictureAssetNavigationQuery = z.infer<
  typeof VisitorPictureAssetNavigationQuerySchema
>;
export type VisitorPictureCommentListQuery = z.infer<typeof VisitorPictureCommentListQuerySchema>;
export type CreateVisitorPictureCommentInput = z.infer<typeof CreateVisitorPictureCommentSchema>;
export type CreateVisitorPictureShareEventInput = z.infer<
  typeof CreateVisitorPictureShareEventSchema
>;
