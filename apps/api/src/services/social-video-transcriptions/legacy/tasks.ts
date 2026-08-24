import { randomUUID } from "node:crypto";
import {
  Errors,
  SupabaseDB,
  accessPolicyService,
  billingService,
  APIFY_POLL_INTERVAL_MS,
  calculateBilling,
  createInputHash,
  extractTranscriptItem,
  extractAudioWithFfmpeg,
  extractDouyinUrl,
  downloadMediaToFile,
  getApifyApiBaseUrl,
  getErrorMessage,
  getSinceByHours,
  normalizeActorIdForPath,
  getTodayStartIso,
  isSocialVideoChargeEnabled,
  normalizeTranscriptText,
  normalizeUrlForHash,
  normalizeSegments,
  readNumber,
  readString,
  serializeRecord,
  serializeRecordSummary,
  socialVideoScriptRepository,
  socialVideoTranscriptionRepository,
  systemSettingsService,
  tencentAsrGateway,
  type ApifyRunResponse,
  type AuthContext,
  type CreateSocialVideoTranscriptionInput,
  type ListSocialVideoTranscriptionsQuery,
  type MediaResolveResult,
  type SocialVideoTranscriptionRecord,
  type TranscriptResult,
  type TestSocialVideoTranscriptionInput,
} from "./shared";

export async function createTask(this: any, input: CreateSocialVideoTranscriptionInput, authContext: AuthContext) {
  await this.assertEnabled();
  if (authContext.employeeId && !authContext.isPlatformAdmin) {
    accessPolicyService.assertPermission(authContext, "social_video_transcription.create");
  }

  const tenantId = await this.resolveTenantId(authContext);
  await this.assertDailyLimit(authContext.authUserId, tenantId);

  const sourceUrl = extractDouyinUrl(input.url);
  const normalizedUrl = normalizeUrlForHash(sourceUrl);
  const inputHash = createInputHash(input.platform, normalizedUrl);
  const cached = await this.findCached(inputHash, tenantId);
  if (cached) {
    const copied = await socialVideoTranscriptionRepository.create({
      tenantId,
      platform: input.platform,
      sourceUrl,
      normalizedUrl,
      inputHash,
      createdByAuthUserId: authContext.authUserId,
      billable: false,
      billingSource: "cache",
    });
    const completed = await socialVideoTranscriptionRepository.update(copied.id, {
      status: "completed",
      progress: 100,
      provider: cached.provider,
      providerActorId: cached.provider_actor_id,
      providerRunId: cached.provider_run_id,
      providerDatasetId: cached.provider_dataset_id,
      resolvedVideoUrl: cached.resolved_video_url,
      resolvedAudioUrl: cached.resolved_audio_url,
      asrTaskId: cached.asr_task_id,
      mediaFileSizeBytes: cached.media_file_size_bytes,
      audioFileSizeBytes: cached.audio_file_size_bytes,
      audioDurationSeconds: cached.audio_duration_seconds,
      billable: false,
      billingDurationSeconds: null,
      billingMinutes: null,
      billingSource: "cache",
      billedAt: null,
      title: cached.title,
      text: cached.text,
      segments: cached.segments,
      rawPayload: cached.raw_payload,
      completedAt: new Date().toISOString(),
    });
    return {
      ...serializeRecord(completed, true),
      cached: true,
    };
  }

  const chargeEnabled = isSocialVideoChargeEnabled();
  if (chargeEnabled) {
    await billingService.assertSocialVideoChargeAvailable({ tenantId });
  }

  const billingCorrelationId = chargeEnabled ? randomUUID() : null;
  const task = await socialVideoTranscriptionRepository.create({
    tenantId,
    platform: input.platform,
    sourceUrl,
    normalizedUrl,
    inputHash,
    createdByAuthUserId: authContext.authUserId,
    billingCorrelationId,
  });

  if (chargeEnabled && billingCorrelationId) {
    try {
      const frozenCredits = await billingService.freezeSocialVideoTask({
        taskId: task.id,
        tenantId,
        correlationId: billingCorrelationId,
      });
      const frozenTask = await socialVideoTranscriptionRepository.update(task.id, {
        billingFrozenCredits: frozenCredits,
      });
      return {
        ...serializeRecord(frozenTask),
        cached: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "视频转文本预冻结积分失败";
      const code = error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code || "TENANT_SOCIAL_VIDEO_FREEZE_FAILED")
        : "TENANT_SOCIAL_VIDEO_FREEZE_FAILED";
      await socialVideoTranscriptionRepository.update(task.id, {
        status: "failed",
        progress: 100,
        errorCode: code,
        errorMessage: message,
        completedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  return {
    ...serializeRecord(task),
    cached: false,
  };
}

export async function getTask(this: any, id: string, authContext: AuthContext) {
  const tenantId = await this.resolveTenantId(authContext);
  const task = await socialVideoTranscriptionRepository.findById(id, tenantId);
  if (!task) {
    throw Errors.notFound("短视频识别任务不存在");
  }

  if (
    task.created_by_auth_user_id &&
    task.created_by_auth_user_id !== authContext.authUserId
  ) {
    throw Errors.forbidden();
  }

  return serializeRecord(task);
}

export async function listTasks(
  this: any,
  query: ListSocialVideoTranscriptionsQuery,
  authContext: AuthContext,
) {
  await this.assertEnabled();
  if (authContext.employeeId && !authContext.isPlatformAdmin) {
    accessPolicyService.assertPermission(authContext, "social_video_transcription.create");
  }

  const tenantId = await this.resolveTenantId(authContext);
  const result = await socialVideoTranscriptionRepository.listRecentByUser({
    tenantId,
    authUserId: authContext.authUserId,
    page: query.page,
    pageSize: query.pageSize,
    platform: query.platform,
    status: query.status,
  });

  const transcriptionIds = result.items.map((item) => item.id);
  const scripts = await socialVideoScriptRepository.listSummariesByTranscriptionIds({
    tenantId,
    transcriptionIds,
  });
  const scriptsByTranscriptionId = new Map<string, typeof scripts>();

  for (const script of scripts) {
    const grouped = scriptsByTranscriptionId.get(script.transcription_id) ?? [];
    grouped.push(script);
    scriptsByTranscriptionId.set(script.transcription_id, grouped);
  }

  return {
    items: result.items.map((record) => serializeRecordSummary({
      record,
      scripts: scriptsByTranscriptionId.get(record.id) ?? [],
    })),
    total: result.total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
