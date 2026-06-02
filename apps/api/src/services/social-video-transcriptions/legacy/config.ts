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

export async function resolveTenantId(this: any, authContext: AuthContext) {
  if (authContext.tenantId) {
    return authContext.tenantId;
  }

  if (authContext.employeeId) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    if (tenantId) return tenantId;
  }

  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customers")
    .select("tenant_id")
    .eq("user_id", authContext.authUserId)
    .not("tenant_id", "is", null)
    .limit(2);

  if (error) {
    throw Errors.dbError("查询客户租户失败", error);
  }

  const tenantIds = Array.from(new Set(
    ((data || []) as Array<{ tenant_id?: string | null }>)
      .map((item) => item.tenant_id)
      .filter((tenantId): tenantId is string => Boolean(tenantId)),
  ));

  if (tenantIds.length > 1) {
    throw Errors.business(
      400,
      "当前账号绑定了多个客户档案，请先选择所属装修公司",
      "SOCIAL_VIDEO_TENANT_AMBIGUOUS",
    );
  }

  if (!tenantIds[0]) {
    throw Errors.business(403, "缺少租户上下文", "FORBIDDEN");
  }

  return tenantIds[0];
}

export async function getTranscriptionProvider(this: any) {
  const provider = await systemSettingsService.getString(
    "SOCIAL_VIDEO_TRANSCRIPTION_PROVIDER",
    "tencent_asr",
  );
  return provider === "apify" ? "apify" : "tencent_asr";
}

export async function getApifyConfig(this: any) {
  const token = await systemSettingsService.getSecretString("APIFY_API_TOKEN");
  if (!token) {
    throw Errors.business(503, "缺少 Apify API Token", "APIFY_TOKEN_MISSING");
  }

  return {
    token,
    actorId: await systemSettingsService.getString(
      "APIFY_TRANSCRIPT_ACTOR_ID",
      "apple_yang/douyin-transcripts-scraper",
    ),
    timeoutMs: await systemSettingsService.getNumber(
      "APIFY_TRANSCRIPT_TIMEOUT_MS",
      60000,
    ),
  };
}

export async function getMediaProcessingConfig(this: any) {
  const maxDownloadBytes = await systemSettingsService.getNumber(
    "SOCIAL_VIDEO_MAX_DOWNLOAD_BYTES",
    100 * 1024 * 1024,
  );
  const downloadTimeoutMs = await systemSettingsService.getNumber(
    "SOCIAL_VIDEO_DOWNLOAD_TIMEOUT_MS",
    180000,
  );
  const ffmpegTimeoutMs = await systemSettingsService.getNumber(
    "SOCIAL_VIDEO_FFMPEG_TIMEOUT_MS",
    120000,
  );
  const audioBitrate = await systemSettingsService.getString(
    "SOCIAL_VIDEO_AUDIO_BITRATE",
    "32k",
  );

  return {
    maxDownloadBytes,
    downloadTimeoutMs,
    ffmpegTimeoutMs,
    audioBitrate,
  };
}

export async function assertEnabled(this: any) {
  const enabled = await systemSettingsService.getBoolean(
    "SOCIAL_VIDEO_TRANSCRIPTION_ENABLED",
    true,
  );
  if (!enabled) {
    throw Errors.business(503, "短视频语音识别功能未启用", "SOCIAL_VIDEO_DISABLED");
  }
}

export async function assertDailyLimit(this: any, authUserId: string, tenantId: string | null) {
  const limit = await systemSettingsService.getNumber(
    "SOCIAL_VIDEO_DAILY_LIMIT_PER_USER",
    20,
  );
  if (limit <= 0) {
    return;
  }

  const count = await socialVideoTranscriptionRepository.countCreatedByUserSince({
    tenantId,
    authUserId,
    since: getTodayStartIso(),
  });
  if (count >= limit) {
    throw Errors.business(
      429,
      "今日短视频识别次数已达上限，请明天再试",
      "SOCIAL_VIDEO_DAILY_LIMIT_EXCEEDED",
    );
  }
}

export async function findCached(this: any, inputHash: string, tenantId: string | null) {
  const ttlHours = await systemSettingsService.getNumber(
    "SOCIAL_VIDEO_CACHE_TTL_HOURS",
    24,
  );
  if (ttlHours <= 0) {
    return null;
  }

  return socialVideoTranscriptionRepository.findRecentCompletedByHash({
    tenantId,
    inputHash,
    since: getSinceByHours(ttlHours),
  });
}
