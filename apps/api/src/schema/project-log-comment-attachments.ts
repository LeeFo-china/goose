import { z } from "zod";

export const PROJECT_COMMENT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const PROJECT_COMMENT_ATTACHMENT_SCENE = "project_log_project_comment";
export const ProjectCommentAttachmentMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp"], {
  message: "评论图片仅支持 JPEG、PNG 或 WebP",
});
export const ProjectCommentAttachmentInitSchema = z.strictObject({
  contract_version: z.literal(2),
  filename: z.string().trim().min(1).max(255).optional(),
  mime_type: ProjectCommentAttachmentMimeSchema,
  size_bytes: z.number().int().positive().max(PROJECT_COMMENT_ATTACHMENT_MAX_BYTES, "图片不能超过 10 MiB"),
});
export const ProjectCommentAttachmentCompleteSchema = z.strictObject({
  contract_version: z.literal(2),
  file_id: z.uuid("无效的文件 ID 格式"),
});
export type ProjectCommentAttachmentInitInput = z.infer<typeof ProjectCommentAttachmentInitSchema>;
export type ProjectCommentAttachmentCompleteInput = z.infer<typeof ProjectCommentAttachmentCompleteSchema>;
