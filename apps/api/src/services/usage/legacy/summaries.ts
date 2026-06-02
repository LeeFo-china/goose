import {
  aiCallLogRepository,
  smsSendLogRepository,
  socialVideoTranscriptionRepository,
} from "./shared";

function incrementCounter(target: Record<string, number>, key: string | null | undefined, amount = 1) {
  const normalized = key || "unknown";
  target[normalized] = (target[normalized] || 0) + amount;
}

export function summarizeAi(rows: Awaited<ReturnType<typeof aiCallLogRepository.listUsageStatsRows>>) {
  const statusCounts: Record<string, number> = {};
  const sceneCounts: Record<string, number> = {};
  const providerCounts: Record<string, number> = {};
  const modelCounts: Record<string, number> = {};
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let missingTokenCount = 0;

  for (const row of rows) {
    incrementCounter(statusCounts, row.status);
    incrementCounter(sceneCounts, row.scene_code);
    incrementCounter(providerCounts, row.provider_code);
    incrementCounter(modelCounts, row.model_code);
    if (typeof row.total_tokens !== "number") {
      missingTokenCount += 1;
    }
    promptTokens += row.prompt_tokens || 0;
    completionTokens += row.completion_tokens || 0;
    totalTokens += row.total_tokens || 0;
  }

  return {
    call_count: rows.length,
    success_count: statusCounts.success || 0,
    failure_count: statusCounts.failure || 0,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    missing_token_count: missingTokenCount,
    status_counts: statusCounts,
    scene_counts: sceneCounts,
    provider_counts: providerCounts,
    model_counts: modelCounts,
  };
}

export function summarizeSms(rows: Awaited<ReturnType<typeof smsSendLogRepository.listUsageRows>>) {
  const statusCounts: Record<string, number> = {};
  const providerCounts: Record<string, number> = {};
  const channelModeCounts: Record<string, number> = {};
  const purposeCounts: Record<string, number> = {};
  let sendCount = 0;

  for (const row of rows) {
    const smsCount = row.sms_count || 0;
    sendCount += smsCount;
    incrementCounter(statusCounts, row.status, smsCount || 1);
    incrementCounter(providerCounts, row.provider, smsCount || 1);
    incrementCounter(channelModeCounts, row.channel_mode, smsCount || 1);
    incrementCounter(purposeCounts, row.purpose, smsCount || 1);
  }

  return {
    send_count: sendCount,
    success_count: statusCounts.success || 0,
    failure_count: statusCounts.failure || 0,
    mock_count: statusCounts.mock || 0,
    disabled_count: statusCounts.disabled || 0,
    status_counts: statusCounts,
    provider_counts: providerCounts,
    channel_mode_counts: channelModeCounts,
    purpose_counts: purposeCounts,
  };
}

export function summarizeSocialVideo(
  rows: Awaited<ReturnType<typeof socialVideoTranscriptionRepository.listUsageStatsRows>>,
) {
  const statusCounts: Record<string, number> = {};
  const providerCounts: Record<string, number> = {};
  let billableTranscriptionCount = 0;
  let durationSeconds = 0;
  let billableMinutes = 0;
  let missingDurationCount = 0;

  for (const row of rows) {
    incrementCounter(statusCounts, row.status);
    incrementCounter(providerCounts, row.provider);

    const isCompleted = row.status === "completed";
    const isBillable = row.billable !== false;
    if (isCompleted && isBillable) {
      billableTranscriptionCount += 1;
      const rowDuration = row.billing_duration_seconds ?? row.audio_duration_seconds;
      const rowMinutes = row.billing_minutes;
      if (typeof rowDuration === "number" && Number.isFinite(rowDuration) && rowDuration > 0) {
        durationSeconds += rowDuration;
        billableMinutes += typeof rowMinutes === "number" && Number.isFinite(rowMinutes)
          ? rowMinutes
          : Math.max(1, Math.ceil(rowDuration / 60));
      } else {
        missingDurationCount += 1;
      }
    }
  }

  return {
    transcription_count: rows.length,
    billable_transcription_count: billableTranscriptionCount,
    success_count: statusCounts.completed || 0,
    failure_count: statusCounts.failed || 0,
    duration_seconds: Number(durationSeconds.toFixed(2)),
    billable_minutes: billableMinutes,
    missing_duration_count: missingDurationCount,
    status_counts: statusCounts,
    provider_counts: providerCounts,
  };
}

export { incrementCounter };
