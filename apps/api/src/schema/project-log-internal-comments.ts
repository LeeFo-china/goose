import { z } from "zod";

export const InternalCommentParamsSchema = z.object({ logId: z.uuid("无效的日志ID") });
export const InternalCommentCreateSchema = z.object({
  content: z.string().trim().min(1, "评论内容不能为空").max(500, "评论内容过长"),
  parent_id: z.uuid("无效的父评论ID").nullable().optional(),
  // Accepted for a stable disabled-media error; never persisted or resolved as URLs.
  images: z.array(z.string().max(2048)).max(9).optional(),
}).strict();
export const InternalCommentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type InternalCommentCreateInput = z.infer<typeof InternalCommentCreateSchema>;
