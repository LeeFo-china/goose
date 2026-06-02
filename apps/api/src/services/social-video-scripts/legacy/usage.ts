import { aiCallLogRepository, socialVideoScriptRepository, socialVideoTranscriptionRepository } from "./shared";
import type { AuthContext, SocialVideoUsageSummaryQuery } from "./shared";

export function incrementCounter(this: any, target: Record<string, number>, key: string | null | undefined) {
  const normalized = key?.trim() || "unknown";
  target[normalized] = (target[normalized] || 0) + 1;
}

export async function getUsageSummary(this: any, 
  query: SocialVideoUsageSummaryQuery,
  authContext: AuthContext,
) {
  this.assertCanManage(authContext);
  const tenantId = this.getTenantIdForAdmin(authContext);
  const [transcriptions, scripts, aiCalls] = await Promise.all([
    socialVideoTranscriptionRepository.listUsageStatsRows({
      tenantId,
      createdFrom: query.created_from,
      createdTo: query.created_to,
    }),
    socialVideoScriptRepository.listUsageStatsRows({
      tenantId,
      createdFrom: query.created_from,
      createdTo: query.created_to,
    }),
    aiCallLogRepository.listUsageStatsRows({
      tenantId,
      sceneCode: "social_video_script",
      createdFrom: query.created_from,
      createdTo: query.created_to,
    }),
  ]);

  const transcriptionStatusCounts: Record<string, number> = {};
  const transcriptionProviderCounts: Record<string, number> = {};
  let totalDuration = 0;
  let durationRecordCount = 0;
  let missingDurationCount = 0;
  for (const item of transcriptions) {
    this.incrementCounter(transcriptionStatusCounts, item.status);
    this.incrementCounter(transcriptionProviderCounts, item.provider);
    if (
      typeof item.audio_duration_seconds === "number" &&
      Number.isFinite(item.audio_duration_seconds)
    ) {
      totalDuration += item.audio_duration_seconds;
      durationRecordCount += 1;
    } else {
      missingDurationCount += 1;
    }
  }

  const scriptStatusCounts: Record<string, number> = {};
  const scriptProviderCounts: Record<string, number> = {};
  const scriptModelCounts: Record<string, number> = {};
  for (const item of scripts) {
    this.incrementCounter(scriptStatusCounts, item.status);
    this.incrementCounter(scriptProviderCounts, item.model_provider);
    this.incrementCounter(scriptModelCounts, item.model_name);
  }

  const aiStatusCounts: Record<string, number> = {};
  const aiProviderCounts: Record<string, number> = {};
  const aiModelCounts: Record<string, number> = {};
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let missingTokenCount = 0;
  for (const item of aiCalls) {
    this.incrementCounter(aiStatusCounts, item.status);
    this.incrementCounter(aiProviderCounts, item.provider_code);
    this.incrementCounter(aiModelCounts, item.model_code);
    if (typeof item.total_tokens !== "number") {
      missingTokenCount += 1;
    }
    promptTokens += item.prompt_tokens || 0;
    completionTokens += item.completion_tokens || 0;
    totalTokens += item.total_tokens || 0;
  }

  return {
    transcriptions: {
      total_count: transcriptions.length,
      success_count: transcriptionStatusCounts.completed || 0,
      failed_count: transcriptionStatusCounts.failed || 0,
      in_progress_count: transcriptions.length -
        (transcriptionStatusCounts.completed || 0) -
        (transcriptionStatusCounts.failed || 0),
      status_counts: transcriptionStatusCounts,
      provider_counts: transcriptionProviderCounts,
      total_duration_seconds: Number(totalDuration.toFixed(2)),
      average_duration_seconds: durationRecordCount
        ? Number((totalDuration / durationRecordCount).toFixed(2))
        : null,
      duration_record_count: durationRecordCount,
      missing_duration_count: missingDurationCount,
    },
    scripts: {
      total_count: scripts.length,
      success_count: scriptStatusCounts.completed || 0,
      failed_count: scriptStatusCounts.failed || 0,
      status_counts: scriptStatusCounts,
      provider_counts: scriptProviderCounts,
      model_counts: scriptModelCounts,
    },
    ai_calls: {
      total_count: aiCalls.length,
      success_count: aiStatusCounts.success || 0,
      failure_count: aiStatusCounts.failure || 0,
      status_counts: aiStatusCounts,
      provider_counts: aiProviderCounts,
      model_counts: aiModelCounts,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      missing_token_count: missingTokenCount,
    },
    };
  }
