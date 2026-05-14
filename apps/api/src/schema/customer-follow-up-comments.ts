import { z } from "zod";
import { PaginationQuerySchema } from "./request";
import { ImageReferenceListSchema } from "./image-references";

export const CustomerFollowUpCommentStatusSchema = z.enum(["active", "hidden"], {
  message: "无效的评论状态",
});

export const CreateCustomerFollowUpCommentSchema = z.object({
  parent_id: z.string().uuid("无效的父评论ID").nullable().optional(),
  content: z.string().trim().min(2, "评论内容至少 2 个字").max(1000, "评论内容不能超过1000字"),
  images: ImageReferenceListSchema.optional(),
});

export const CustomerFollowUpCommentsListQuerySchema = PaginationQuerySchema;

export type CreateCustomerFollowUpCommentInput = z.infer<typeof CreateCustomerFollowUpCommentSchema>;
export type CustomerFollowUpCommentsListQuery = z.infer<typeof CustomerFollowUpCommentsListQuerySchema>;
