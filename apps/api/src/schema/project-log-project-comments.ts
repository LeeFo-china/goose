import { z } from "zod";
// v1 remains available only during the explicit client migration window.
export {
  InternalCommentParamsSchema as ProjectCommentParamsSchema,
  InternalCommentCreateSchema as ProjectCommentCreateSchema,
  InternalCommentQuerySchema as ProjectCommentQuerySchema,
  type InternalCommentCreateInput as ProjectCommentCreateInput,
} from "./project-log-internal-comments";

export const ProjectCommentV2CreateSchema = z.object({
  contract_version: z.literal(2),
  client_request_id: z.uuid("无效的发送请求ID"),
  content: z.string().trim().max(500, "评论内容过长").default(""),
  parent_id: z.uuid("无效的父评论ID").nullable().optional(),
  attachment_ids: z.array(z.uuid("无效的附件ID")).max(9, "最多上传9张图片").default([]),
}).strict().superRefine((value, context) => {
  if (!value.content && !value.attachment_ids.length) {
    context.addIssue({ code: "custom", message: "请填写内容或添加图片", path: ["content"] });
  }
  if (new Set(value.attachment_ids).size !== value.attachment_ids.length) {
    context.addIssue({ code: "custom", message: "附件不能重复", path: ["attachment_ids"] });
  }
});
export const ProjectCommentV2QuerySchema = z.object({
  contract_version: z.coerce.number().pipe(z.literal(2)),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  before: z.string().min(1).max(512).optional(),
}).strict();
export const ProjectCommentPreviewParamsSchema = z.object({ projectId: z.uuid("无效的项目ID") });
// Internal auxiliary batch is explicitly bounded to 20 logs on the current page.
export const ProjectCommentPreviewSchema = z.object({
  contract_version: z.literal(2),
  log_ids: z.array(z.uuid("无效的日志ID")).min(1).max(20)
    .refine(ids => new Set(ids).size === ids.length, "日志ID不能重复"),
}).strict();
export type ProjectCommentV2CreateInput = z.input<typeof ProjectCommentV2CreateSchema>;
export type ProjectCommentV2QueryInput = z.input<typeof ProjectCommentV2QuerySchema>;
export type ProjectCommentPreviewInput = z.infer<typeof ProjectCommentPreviewSchema>;
