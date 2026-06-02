import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  socialVideoTranscriptionRepository,
  systemSettingsService,
  tencentAsrGateway,
  type ApifyRunResponse,
  type AuthContext,
  type CreateSocialVideoTranscriptionInput,
  type MediaResolveResult,
  type SocialVideoTranscriptionRecord,
  type TranscriptResult,
  type TestSocialVideoTranscriptionInput,
} from "./shared";

export async function processTask(this: any, id: string) {
  const task = await socialVideoTranscriptionRepository.findById(id);
  if (!task || task.status === "completed") {
    return;
  }

  try {
    await socialVideoTranscriptionRepository.update(id, {
      status: "resolving",
      progress: 20,
      errorCode: null,
      errorMessage: null,
    });

    const config = await this.getApifyConfig();
    const provider = await this.getTranscriptionProvider();
    await socialVideoTranscriptionRepository.update(id, {
      status: provider === "apify" ? "transcribing" : "resolving",
      progress: provider === "apify" ? 60 : 25,
      provider,
      providerActorId: config.actorId,
    });

    if (provider === "tencent_asr") {
      const media = await this.apifyGateway.resolveMedia({
        token: config.token,
        actorId: config.actorId,
        videoUrl: task.source_url,
        timeoutMs: config.timeoutMs,
      });
      await socialVideoTranscriptionRepository.update(id, {
        status: "downloading",
        progress: 35,
        providerRunId: media.runId,
        providerDatasetId: media.datasetId,
        resolvedVideoUrl: media.videoUrl,
        resolvedAudioUrl: media.audioUrl,
        title: media.title,
        audioDurationSeconds: media.durationSeconds,
        rawPayload: media.rawPayload,
      });

      const mediaConfig = await this.getMediaProcessingConfig();
      const tempDir = await mkdtemp(join(tmpdir(), "gooes-social-video-"));
      const mediaFilePath = join(tempDir, "source-media");
      const audioFilePath = join(tempDir, "audio.mp3");

      try {
        const mediaFileSizeBytes = await downloadMediaToFile({
          url: media.audioUrl || media.videoUrl || "",
          filePath: mediaFilePath,
          timeoutMs: mediaConfig.downloadTimeoutMs,
          maxBytes: mediaConfig.maxDownloadBytes,
        });
        await socialVideoTranscriptionRepository.update(id, {
          status: "extracting_audio",
          progress: 50,
          mediaFileSizeBytes,
        });

        const audioFileSizeBytes = await extractAudioWithFfmpeg({
          mediaFilePath,
          audioFilePath,
          timeoutMs: mediaConfig.ffmpegTimeoutMs,
          bitrate: mediaConfig.audioBitrate,
        });
        await socialVideoTranscriptionRepository.update(id, {
          status: "creating_asr_task",
          progress: 65,
          audioFileSizeBytes,
        });

        const asrResult = await tencentAsrGateway.transcribeAudioFile(audioFilePath, {
          onTaskCreated: async (taskId) => {
            await socialVideoTranscriptionRepository.update(id, {
              status: "transcribing",
              progress: 75,
              asrTaskId: taskId,
            });
          },
        });
        const durationSeconds = asrResult.audioDurationSeconds ?? media.durationSeconds;
        const billing = calculateBilling({
          durationSeconds,
          source: asrResult.provider,
        });
        const completed = await socialVideoTranscriptionRepository.update(id, {
          status: "completed",
          progress: 100,
          provider: asrResult.provider,
          asrTaskId: asrResult.taskId,
          title: media.title,
          text: asrResult.text,
          segments: asrResult.segments,
          rawPayload: {
            resolver: media.rawPayload,
            asr: asrResult.rawPayload,
          },
          audioDurationSeconds: durationSeconds,
          billingDurationSeconds: billing.billingDurationSeconds,
          billingMinutes: billing.billingMinutes,
          billingSource: billing.billingSource,
          billedAt: billing.billedAt,
          completedAt: new Date().toISOString(),
          errorCode: null,
          errorMessage: null,
        });
        await this.finalizeCompletedBilling(completed);
      } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
      return;
    }

    const result = await this.apifyGateway.transcribe({
      token: config.token,
      actorId: config.actorId,
      videoUrl: task.source_url,
      timeoutMs: config.timeoutMs,
    });
    const billing = calculateBilling({
      durationSeconds: result.durationSeconds,
      source: result.provider,
    });

    const completed = await socialVideoTranscriptionRepository.update(id, {
      status: "completed",
      progress: 100,
      provider: result.provider,
      providerActorId: result.actorId,
      providerRunId: result.runId,
      providerDatasetId: result.datasetId,
      title: result.title,
      text: result.text,
      segments: result.segments,
      rawPayload: result.rawPayload,
      audioDurationSeconds: result.durationSeconds,
      billingDurationSeconds: billing.billingDurationSeconds,
      billingMinutes: billing.billingMinutes,
      billingSource: billing.billingSource,
      billedAt: billing.billedAt,
      completedAt: new Date().toISOString(),
      errorCode: null,
      errorMessage: null,
    });
    await this.finalizeCompletedBilling(completed);
  } catch (error) {
    let releasedFreeze = false;
    if (isSocialVideoChargeEnabled()) {
      const currentTask = await socialVideoTranscriptionRepository.findById(id);
      const released = currentTask
        ? await billingService.releaseSocialVideoTaskFreeze(currentTask).catch(() => null)
        : null;
      releasedFreeze = Boolean(released);
    }
    const message = error instanceof Error ? error.message : "短视频识别失败";
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "SOCIAL_VIDEO_TRANSCRIPTION_FAILED")
      : "SOCIAL_VIDEO_TRANSCRIPTION_FAILED";
    await socialVideoTranscriptionRepository.update(id, {
      status: "failed",
      progress: 100,
      errorCode: code,
      errorMessage: message,
      completedAt: new Date().toISOString(),
      ...(releasedFreeze ? { billingFrozenCredits: 0 } : {}),
    });
  }
}
