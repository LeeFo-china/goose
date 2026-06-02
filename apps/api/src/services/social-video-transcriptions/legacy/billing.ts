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

export async function finalizeCompletedBilling(this: any, record: SocialVideoTranscriptionRecord) {
  if (!isSocialVideoChargeEnabled() || !record.billable || record.billing_charged) {
    return;
  }

  try {
    const result = await billingService.settleSocialVideoTask(record);
    if (!result?.event) {
      return;
    }

    const chargedAt = result.settled ? new Date().toISOString() : null;
    const failedEvent = result.event.status === "failed";
    await socialVideoTranscriptionRepository.update(record.id, {
      billingEventId: result.event.id,
      billingCharged: result.settled,
      billingChargedAt: chargedAt,
      billedAt: chargedAt || record.billed_at,
      billingFrozenCredits: 0,
      errorCode: failedEvent
        ? result.event.failure_code || "TENANT_SOCIAL_VIDEO_BILLING_FAILED"
        : record.error_code,
      errorMessage: failedEvent
        ? result.event.failure_message || "视频转文本扣费失败"
        : record.error_message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "视频转文本扣费失败";
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "TENANT_SOCIAL_VIDEO_BILLING_FAILED")
      : "TENANT_SOCIAL_VIDEO_BILLING_FAILED";
    await socialVideoTranscriptionRepository.update(record.id, {
      errorCode: code,
      errorMessage: message,
    });
  }
}
