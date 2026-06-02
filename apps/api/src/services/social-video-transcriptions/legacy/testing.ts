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

export async function testApify(this: any, input: TestSocialVideoTranscriptionInput) {
  await this.assertEnabled();
  const sourceUrl = extractDouyinUrl(input.url);
  const config = await this.getApifyConfig();
  const result = await this.apifyGateway.transcribe({
    token: config.token,
    actorId: config.actorId,
    videoUrl: sourceUrl,
    timeoutMs: config.timeoutMs,
  });

  return {
    provider: result.provider,
    actor_id: result.actorId,
    run_id: result.runId,
    dataset_id: result.datasetId,
    source_url: sourceUrl,
    title: result.title,
    text: result.text,
    text_length: result.text.length,
    segments: result.segments,
    segment_count: result.segments.length,
  };
}
