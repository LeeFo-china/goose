import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const VisitorPictureAssetListQuerySchema = PaginationQuerySchema.extend({
  category_id: z.uuid("无效的分类 ID").optional(),
});

export const VisitorPictureAssetParamsSchema = z.object({
  id: z.uuid("无效的图片 ID"),
});

export const VisitorPictureCommentListQuerySchema = PaginationQuerySchema;

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

export type VisitorPictureAssetListQuery = z.infer<typeof VisitorPictureAssetListQuerySchema>;
export type VisitorPictureCommentListQuery = z.infer<typeof VisitorPictureCommentListQuerySchema>;
export type CreateVisitorPictureCommentInput = z.infer<typeof CreateVisitorPictureCommentSchema>;
