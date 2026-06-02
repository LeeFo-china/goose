import { Errors, PROMPT_VERSION, socialVideoScriptRepository, socialVideoTranscriptionRepository, systemSettingsService } from "./shared";
import type { AuthContext, CreateSocialVideoScriptInput, SocialVideoScriptGoal, SocialVideoScriptStyle, SocialVideoScriptTargetPlatform } from "./shared";
import { callAi } from "./ai-generation";
import { getSinceByHours, getTodayStartIso, serializeScript, truncateByChars } from "./normalization";

export async function assertDailyLimit(this: any, authUserId: string, tenantId: string | null) {
  const limit = await systemSettingsService.getNumber(
    "SOCIAL_VIDEO_SCRIPT_DAILY_LIMIT_PER_USER",
    20,
  );
  if (limit <= 0) return;

  const count = await socialVideoScriptRepository.countCreatedByUserSince({
    tenantId,
    userId: authUserId,
    since: getTodayStartIso(),
  });
  if (count >= limit) {
    throw Errors.business(
      429,
      "今日脚本生成次数已达上限，请明天再试",
      "SOCIAL_VIDEO_SCRIPT_DAILY_LIMIT_EXCEEDED",
    );
  }
}

export async function findCached(this: any, input: {
  tenantId: string | null;
  transcriptionId: string;
  targetPlatform: SocialVideoScriptTargetPlatform;
  style: SocialVideoScriptStyle;
  durationSeconds: number;
  goal: SocialVideoScriptGoal;
}) {
  const ttlHours = await systemSettingsService.getNumber(
    "SOCIAL_VIDEO_SCRIPT_CACHE_TTL_HOURS",
    24,
  );
  if (ttlHours <= 0) return null;

  return socialVideoScriptRepository.findRecentCompleted({
    ...input,
    since: getSinceByHours(ttlHours),
  });
}

export function normalizeScriptInput(this: any, input: CreateSocialVideoScriptInput) {
  if (input.style === "douyin_practical") {
    return {
      targetPlatform: "douyin" as const,
      style: "practical" as const,
      durationSeconds: input.duration_seconds,
      goal: input.goal,
    };
  }

  if (input.style === "xiaohongshu") {
    return {
      targetPlatform: "xiaohongshu" as const,
      style: "seeding" as const,
      durationSeconds: input.duration_seconds,
      goal: input.goal,
    };
  }

  const targetPlatform = input.target_platform ?? "douyin";
  const style = input.style
    ?? (targetPlatform === "xiaohongshu" ? "seeding" : "practical");

  return {
    targetPlatform,
    style,
    durationSeconds: input.duration_seconds,
    goal: input.goal,
  };
}

export async function generateScript(this: any, 
  transcriptionId: string,
  input: CreateSocialVideoScriptInput,
  authContext: AuthContext,
) {
  const transcription = await socialVideoTranscriptionRepository.findById(transcriptionId);
  if (!transcription) {
    throw Errors.business(
      404,
      "转写任务不存在",
      "SOCIAL_VIDEO_TRANSCRIPTION_NOT_FOUND",
    );
  }

  this.assertCanUseTranscription(authContext, transcription);
  if (transcription.status !== "completed") {
    throw Errors.business(
      400,
      "转写任务尚未完成",
      "SOCIAL_VIDEO_TRANSCRIPTION_NOT_COMPLETED",
    );
  }

  const text = typeof transcription.text === "string" ? transcription.text.trim() : "";
  if (!text) {
    throw Errors.business(
      400,
      "转写文本为空，无法生成拍摄脚本",
      "SOCIAL_VIDEO_TRANSCRIPTION_TEXT_EMPTY",
    );
  }

  const normalizedInput = this.normalizeScriptInput(input);
  if (!input.regenerate) {
    const cached = await this.findCached({
      tenantId: transcription.tenant_id,
      transcriptionId,
      targetPlatform: normalizedInput.targetPlatform,
      style: normalizedInput.style,
      durationSeconds: normalizedInput.durationSeconds,
      goal: normalizedInput.goal,
    });
    if (cached) {
      return serializeScript(cached, true);
    }
  }

  await this.assertDailyLimit(authContext.authUserId, transcription.tenant_id);

  const maxSourceChars = await systemSettingsService.getNumber(
    "SOCIAL_VIDEO_SCRIPT_SOURCE_MAX_CHARS",
    4000,
  );
  const aiResult = await callAi({
    tenantId: transcription.tenant_id,
    source: "customer_miniprogram",
    authUserId: authContext.authUserId,
    transcriptionId,
    targetPlatform: normalizedInput.targetPlatform,
    style: normalizedInput.style,
    durationSeconds: normalizedInput.durationSeconds,
    goal: normalizedInput.goal,
    title: transcription.title,
    text: truncateByChars(text, Math.max(1000, Math.min(maxSourceChars, 8000))),
  });

  const record = await socialVideoScriptRepository.create({
    tenantId: transcription.tenant_id,
    transcriptionId,
    userId: authContext.authUserId,
    platform: transcription.platform,
    targetPlatform: normalizedInput.targetPlatform,
    style: normalizedInput.style,
    durationSeconds: normalizedInput.durationSeconds,
    goal: normalizedInput.goal,
    title: aiResult.payload.title,
    rewrittenCopy: aiResult.payload.rewritten_copy,
    hook: aiResult.payload.hook,
    shootingScript: aiResult.payload.shooting_script,
    coverTextOptions: aiResult.payload.cover_text_options,
    captionOptions: aiResult.payload.caption_options,
    tips: aiResult.payload.tips,
    sourceTextLength: Array.from(text).length,
    promptVersion: PROMPT_VERSION,
    modelProvider: aiResult.provider,
    modelName: aiResult.model,
    status: "completed",
    rawPayload: aiResult.rawPayload,
  });

  return serializeScript(record);
}
