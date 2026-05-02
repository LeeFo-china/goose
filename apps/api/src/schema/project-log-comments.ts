import { z } from "zod";
import { PROJECT_LOG_COMMENT_AUTHOR_TYPE_VALUES } from "@gooes/domain";

export const ProjectLogCommentBaseSchema = z.object({
  id: z.string().uuid("无效的评论ID").optional(),
  log_id: z.string().uuid("无效的日志ID"),
  parent_id: z.string().uuid("无效的父评论ID").nullable().optional(),
  author_type: z.enum(PROJECT_LOG_COMMENT_AUTHOR_TYPE_VALUES, {
    message: "评论作者身份无效",
  }),
  author_id: z.string().uuid("无效的评论作者ID"),
  content: z.string().trim().min(1, "评论内容不能为空").max(500, "评论内容过长"),
  rating: z.number().int().min(1, "评分最小为1").max(5, "评分最大为5").nullable().optional(),
  images: z.array(z.string().url("无效的评论图片URL")).max(9, "评论图片最多上传9张").optional(),
  created_at: z.string().datetime("无效的时间格式").optional(),
  updated_at: z.string().datetime("无效的时间格式").nullable().optional(),
  deleted_at: z.string().datetime("无效的时间格式").nullable().optional(),
});

export const CreateProjectLogCommentSchema = z.object({
  log_id: z.string().uuid("无效的日志ID"),
  parent_id: z.string().uuid("无效的父评论ID").nullable().optional(),
  content: z.string().trim().min(1, "评论内容不能为空").max(500, "评论内容过长"),
  rating: z.number().int().min(1, "评分最小为1").max(5, "评分最大为5").nullable().optional(),
  images: z.array(z.string().url("无效的评论图片URL")).max(9, "评论图片最多上传9张").optional(),
});

export const ProjectLogCommentsQuerySchema = z.object({
  log_id: z.string().uuid("无效的日志ID"),
});

export type ProjectLogCommentType = z.infer<typeof ProjectLogCommentBaseSchema>;
export type CreateProjectLogCommentInput = z.infer<typeof CreateProjectLogCommentSchema>;
export type ProjectLogCommentsQueryType = z.infer<typeof ProjectLogCommentsQuerySchema>;
