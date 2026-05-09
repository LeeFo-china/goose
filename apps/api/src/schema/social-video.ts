import { z } from "zod";

export const SocialVideoPlatformSchema = z.enum(["douyin"], {
  message: "暂时只支持抖音链接",
});

export const SocialVideoTranscriptionStatusSchema = z.enum([
  "pending",
  "resolving",
  "downloading",
  "extracting_audio",
  "creating_asr_task",
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

export const SocialVideoScriptStyleSchema = z.enum([
  "practical",
  "seeding",
  "professional",
  "down_to_earth",
  "douyin_practical",
  "xiaohongshu",
]).default("practical");

export const SocialVideoScriptTargetPlatformSchema = z.enum([
  "douyin",
  "xiaohongshu",
  "shipinhao",
  "kuaishou",
]).default("douyin");

export const SocialVideoScriptGoalSchema = z.enum([
  "lead_generation",
  "education",
  "case_seeding",
  "brand_trust",
]).default("lead_generation");

export const CreateSocialVideoScriptSchema = z.object({
  target_platform: SocialVideoScriptTargetPlatformSchema.optional(),
  style: SocialVideoScriptStyleSchema.optional(),
  duration_seconds: z.coerce.number()
    .int("目标时长必须是整数")
    .refine((value) => [30, 60, 90].includes(value), "目标时长只支持 30/60/90 秒")
    .optional()
    .default(60),
  goal: SocialVideoScriptGoalSchema.optional().default("lead_generation"),
});

export type CreateSocialVideoTranscriptionInput = z.infer<
  typeof CreateSocialVideoTranscriptionSchema
>;
export type TestSocialVideoTranscriptionInput = z.infer<
  typeof TestSocialVideoTranscriptionSchema
>;
export type CreateSocialVideoScriptInput = z.infer<
  typeof CreateSocialVideoScriptSchema
>;
export type SocialVideoScriptStyle = z.infer<typeof SocialVideoScriptStyleSchema>;
export type SocialVideoScriptGoal = z.infer<typeof SocialVideoScriptGoalSchema>;
export type SocialVideoScriptTargetPlatform = z.infer<
  typeof SocialVideoScriptTargetPlatformSchema
>;
export type SocialVideoTranscriptionStatus = z.infer<
  typeof SocialVideoTranscriptionStatusSchema
>;
