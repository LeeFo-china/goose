import { z } from "zod";

export const SocialVideoPlatformSchema = z.enum(["douyin"], {
  message: "暂时只支持抖音链接",
});

export const SocialVideoTranscriptionStatusSchema = z.enum([
  "pending",
  "resolving",
  "transcribing",
  "completed",
  "failed",
]);

export const CreateSocialVideoTranscriptionSchema = z.object({
  platform: SocialVideoPlatformSchema.default("douyin"),
  url: z.string().trim().min(1, "请输入抖音视频链接").max(2048, "链接过长"),
});

export const SocialVideoTranscriptionIdParamsSchema = z.object({
  id: z.uuid("无效的识别任务 ID"),
});

export const TestSocialVideoTranscriptionSchema = z.object({
  platform: SocialVideoPlatformSchema.default("douyin"),
  url: z.string().trim().min(1, "请输入抖音视频链接").max(2048, "链接过长"),
});

export type CreateSocialVideoTranscriptionInput = z.infer<
  typeof CreateSocialVideoTranscriptionSchema
>;
export type TestSocialVideoTranscriptionInput = z.infer<
  typeof TestSocialVideoTranscriptionSchema
>;
export type SocialVideoTranscriptionStatus = z.infer<
  typeof SocialVideoTranscriptionStatusSchema
>;
