import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Errors } from "@/errors/error-factory";
import {
  socialVideoTranscriptionRepository,
  type SocialVideoTranscriptionRecord,
} from "@/repositories/social-video-transcriptions";
import type {
  CreateSocialVideoTranscriptionInput,
  TestSocialVideoTranscriptionInput,
} from "@/schema/social-video";
import { systemSettingsService } from "@/services/system-settings";
import { tencentAsrGateway } from "@/services/tencent-asr";

type ApifyRunStatus = "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED-OUT" | "ABORTED";

type ApifyRun = {
  id: string;
  status: ApifyRunStatus;
  defaultDatasetId?: string | null;
  statusMessage?: string | null;
};

type ApifyRunResponse = {
  data?: ApifyRun;
  error?: {
    message?: string;
  };
};

type ApifyTranscriptItem = {
  title?: unknown;
  text?: unknown;
  segments?: unknown;
  videoUrl?: unknown;
  audioUrl?: unknown;
  errMsg?: unknown;
  error?: unknown;
  message?: unknown;
  duration?: unknown;
};

type TranscriptResult = {
  provider: "apify";
  actorId: string;
  runId: string;
  datasetId: string;
  title: string | null;
  text: string;
  segments: unknown[];
  rawPayload: unknown;
};

type MediaResolveResult = {
  actorId: string;
  runId: string;
  datasetId: string;
  title: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  rawPayload: unknown;
};

const DOUYIN_URL_PATTERN = /https?:\/\/(?:v\.|www\.)?douyin\.com\/[^\s，。]+|https?:\/\/(?:www\.)?iesdouyin\.com\/[^\s，。]+/i;
const APIFY_POLL_INTERVAL_MS = 1500;
const execFileAsync = promisify(execFile);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeActorIdForPath(actorId: string) {
  return actorId.trim().replace(/\//g, "~");
}

function getApifyApiBaseUrl() {
  return "https://api.apify.com/v2";
}

function getErrorMessage(input: unknown, fallback: string) {
  if (input && typeof input === "object" && "message" in input) {
    const message = (input as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function extractDouyinUrl(input: string) {
  const matched = input.match(DOUYIN_URL_PATTERN)?.[0];
  if (!matched) {
    throw Errors.badRequest("请输入有效的抖音视频链接");
  }

  return matched
    .trim()
    .replace(/[，。,.!?！？;；:：]+$/g, "");
}

function normalizeUrlForHash(input: string) {
  const url = new URL(input);
  url.host = url.host.toLowerCase();

  for (const key of Array.from(url.searchParams.keys())) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      ["source", "share_token", "share_sign", "timestamp"].includes(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }

  url.hash = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  return url.toString().replace(/\/$/g, "");
}

function createInputHash(platform: string, normalizedUrl: string) {
  return createHash("sha256")
    .update(`${platform}:${normalizedUrl}`)
    .digest("hex");
}

function getSinceByHours(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() - Math.max(hours, 0));
  return date.toISOString();
}

function getTodayStartIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function serializeRecord(record: SocialVideoTranscriptionRecord) {
  return {
    id: record.id,
    platform: record.platform,
    source_url: record.source_url,
    normalized_url: record.normalized_url,
    status: record.status,
    progress: record.progress,
    provider: record.provider,
    provider_actor_id: record.provider_actor_id,
    asr_task_id: record.asr_task_id,
    title: record.title,
    text: record.text,
    segments: Array.isArray(record.segments) ? record.segments : [],
    audio_duration_seconds: record.audio_duration_seconds,
    error_code: record.error_code,
    error_message: record.error_message,
    created_at: record.created_at,
    updated_at: record.updated_at,
    completed_at: record.completed_at,
  };
}

function extractTranscriptItem(items: unknown): ApifyTranscriptItem {
  if (!Array.isArray(items) || items.length === 0) {
    throw Errors.business(502, "Apify 未返回识别结果", "APIFY_EMPTY_RESULT");
  }

  const first = items[0];
  if (!first || typeof first !== "object") {
    throw Errors.business(502, "Apify 返回结果格式异常", "APIFY_INVALID_RESULT");
  }

  return first as ApifyTranscriptItem;
}

function normalizeSegments(input: unknown) {
  return Array.isArray(input) ? input : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeTranscriptText(item: ApifyTranscriptItem) {
  if (typeof item.text === "string" && item.text.trim()) {
    return item.text.trim();
  }

  const errorMessage = [item.errMsg, item.error, item.message]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join("；");
  if (errorMessage) {
    throw Errors.business(502, errorMessage, "APIFY_TRANSCRIPT_FAILED");
  }

  throw Errors.business(502, "Apify 未返回可用文本", "APIFY_TRANSCRIPT_EMPTY");
}

function assertDownloadableMediaUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw Errors.business(502, "Apify 返回的媒体地址格式异常", "SOCIAL_VIDEO_MEDIA_URL_INVALID");
  }

  if (url.protocol !== "https:") {
    throw Errors.business(502, "媒体地址必须使用 HTTPS", "SOCIAL_VIDEO_MEDIA_URL_UNSAFE");
  }

  const host = url.hostname.toLowerCase();
  const allowed = host === "douyin.com" ||
    host.endsWith(".douyin.com") ||
    host === "douyinvod.com" ||
    host.endsWith(".douyinvod.com") ||
    host.endsWith(".byteoversea.com") ||
    host.endsWith(".byteimg.com") ||
    host.endsWith(".snssdk.com");
  if (!allowed) {
    throw Errors.business(
      502,
      "Apify 返回的媒体地址不在允许的抖音域名范围内",
      "SOCIAL_VIDEO_MEDIA_HOST_DENIED",
      { host },
    );
  }
}

async function downloadMediaToFile(input: {
  url: string;
  filePath: string;
  timeoutMs: number;
  maxBytes: number;
}) {
  assertDownloadableMediaUrl(input.url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(input.url, {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw Errors.business(
        502,
        `下载抖音媒体失败：${response.status}`,
        "SOCIAL_VIDEO_MEDIA_DOWNLOAD_FAILED",
      );
    }

    const contentLength = Number(response.headers.get("content-length") || "0");
    if (contentLength > input.maxBytes) {
      throw Errors.business(
        413,
        "抖音媒体文件超过下载大小限制",
        "SOCIAL_VIDEO_MEDIA_TOO_LARGE",
        { contentLength, maxBytes: input.maxBytes },
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > input.maxBytes) {
      throw Errors.business(
        413,
        "抖音媒体文件超过下载大小限制",
        "SOCIAL_VIDEO_MEDIA_TOO_LARGE",
        { bytes: buffer.byteLength, maxBytes: input.maxBytes },
      );
    }
    await writeFile(input.filePath, buffer);
    return buffer.byteLength;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw Errors.business(504, "下载抖音媒体超时", "SOCIAL_VIDEO_MEDIA_DOWNLOAD_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function extractAudioWithFfmpeg(input: {
  mediaFilePath: string;
  audioFilePath: string;
  timeoutMs: number;
  bitrate: string;
}) {
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      input.mediaFilePath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      input.bitrate,
      input.audioFilePath,
    ], {
      timeout: input.timeoutMs,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    throw Errors.business(
      503,
      "ffmpeg 提取音频失败，请检查服务器 ffmpeg 和视频格式",
      "SOCIAL_VIDEO_FFMPEG_FAILED",
      error instanceof Error ? { message: error.message } : undefined,
    );
  }

  const audioStat = await stat(input.audioFilePath).catch(() => null);
  if (!audioStat || audioStat.size <= 0) {
    throw Errors.business(503, "ffmpeg 未生成有效音频文件", "SOCIAL_VIDEO_AUDIO_EMPTY");
  }

  return audioStat.size;
}

class ApifyTranscriptGateway {
  private async requestApify<T>(input: {
    path: string;
    token: string;
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
  }) {
    const url = new URL(`${getApifyApiBaseUrl()}${input.path}`);
    url.searchParams.set("token", input.token);

    const response = await fetch(url, {
      method: input.method || "GET",
      headers: input.body ? { "content-type": "application/json" } : undefined,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: {
        message?: string;
      };
    };

    if (!response.ok) {
      throw Errors.business(
        502,
        getErrorMessage(payload?.error, "Apify 接口调用失败"),
        "APIFY_REQUEST_FAILED",
        { statusCode: response.status },
      );
    }

    return payload as T;
  }

  private async startRun(input: {
    token: string;
    actorId: string;
    videoUrl: string;
    signal: AbortSignal;
  }) {
    const actorPathId = normalizeActorIdForPath(input.actorId);
    const payload = await this.requestApify<ApifyRunResponse>({
      path: `/acts/${encodeURIComponent(actorPathId)}/runs`,
      token: input.token,
      method: "POST",
      body: { videoUrl: input.videoUrl },
      signal: input.signal,
    });

    if (!payload.data?.id) {
      throw Errors.business(502, "Apify 未返回 Run ID", "APIFY_RUN_CREATE_FAILED");
    }

    return payload.data;
  }

  private async getRun(input: {
    token: string;
    runId: string;
    signal: AbortSignal;
  }) {
    const payload = await this.requestApify<ApifyRunResponse>({
      path: `/actor-runs/${encodeURIComponent(input.runId)}`,
      token: input.token,
      signal: input.signal,
    });

    if (!payload.data?.id) {
      throw Errors.business(502, "Apify Run 状态异常", "APIFY_RUN_STATUS_FAILED");
    }

    return payload.data;
  }

  private async getDatasetItems(input: {
    token: string;
    datasetId: string;
    signal: AbortSignal;
  }) {
    return this.requestApify<unknown[]>({
      path: `/datasets/${encodeURIComponent(input.datasetId)}/items`,
      token: input.token,
      signal: input.signal,
    });
  }

  private async runAndReadItem(input: {
    token: string;
    actorId: string;
    videoUrl: string;
    timeoutMs: number;
  }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const startedAt = Date.now();
      const run = await this.startRun({
        token: input.token,
        actorId: input.actorId,
        videoUrl: input.videoUrl,
        signal: controller.signal,
      });

      let currentRun = run;
      while (currentRun.status === "READY" || currentRun.status === "RUNNING") {
        if (Date.now() - startedAt > input.timeoutMs) {
          throw Errors.business(504, "Apify 转写超时", "APIFY_TIMEOUT");
        }

        await sleep(APIFY_POLL_INTERVAL_MS);
        currentRun = await this.getRun({
          token: input.token,
          runId: run.id,
          signal: controller.signal,
        });
      }

      if (currentRun.status !== "SUCCEEDED") {
        throw Errors.business(
          502,
          currentRun.statusMessage || `Apify Run ${currentRun.status}`,
          "APIFY_RUN_FAILED",
          { runId: run.id, status: currentRun.status },
        );
      }

      const datasetId = currentRun.defaultDatasetId || run.defaultDatasetId;
      if (!datasetId) {
        throw Errors.business(502, "Apify 未返回 Dataset ID", "APIFY_DATASET_MISSING");
      }

      const items = await this.getDatasetItems({
        token: input.token,
        datasetId,
        signal: controller.signal,
      });
      const item = extractTranscriptItem(items);

      return {
        run,
        datasetId,
        item,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw Errors.business(504, "Apify 转写超时", "APIFY_TIMEOUT");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async resolveMedia(input: {
    token: string;
    actorId: string;
    videoUrl: string;
    timeoutMs: number;
  }): Promise<MediaResolveResult> {
    const { run, datasetId, item } = await this.runAndReadItem(input);
    const title = readString(item.title);
    const videoUrl = readString(item.videoUrl);
    const audioUrl = readString(item.audioUrl);
    if (!videoUrl && !audioUrl) {
      throw Errors.business(502, "Apify 未返回可用音视频地址", "APIFY_MEDIA_URL_MISSING");
    }

    return {
      actorId: input.actorId,
      runId: run.id,
      datasetId,
      title,
      videoUrl,
      audioUrl,
      durationSeconds: readNumber(item.duration),
      rawPayload: item,
    };
  }

  async transcribe(input: {
    token: string;
    actorId: string;
    videoUrl: string;
    timeoutMs: number;
  }): Promise<TranscriptResult> {
    const { run, datasetId, item } = await this.runAndReadItem(input);
    const text = normalizeTranscriptText(item);
    const title = readString(item.title);

    return {
      provider: "apify",
      actorId: input.actorId,
      runId: run.id,
      datasetId,
      title,
      text,
      segments: normalizeSegments(item.segments),
      rawPayload: item,
    };
  }
}

class SocialVideoTranscriptionService {
  private apifyGateway = new ApifyTranscriptGateway();

  private async getTranscriptionProvider() {
    const provider = await systemSettingsService.getString(
      "SOCIAL_VIDEO_TRANSCRIPTION_PROVIDER",
      "tencent_asr",
    );
    return provider === "apify" ? "apify" : "tencent_asr";
  }

  private async getApifyConfig() {
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

  private async getMediaProcessingConfig() {
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

  private async assertEnabled() {
    const enabled = await systemSettingsService.getBoolean(
      "SOCIAL_VIDEO_TRANSCRIPTION_ENABLED",
      true,
    );
    if (!enabled) {
      throw Errors.business(503, "短视频语音识别功能未启用", "SOCIAL_VIDEO_DISABLED");
    }
  }

  private async assertDailyLimit(authUserId: string) {
    const limit = await systemSettingsService.getNumber(
      "SOCIAL_VIDEO_DAILY_LIMIT_PER_USER",
      20,
    );
    if (limit <= 0) {
      return;
    }

    const count = await socialVideoTranscriptionRepository.countCreatedByUserSince({
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

  private async findCached(inputHash: string) {
    const ttlHours = await systemSettingsService.getNumber(
      "SOCIAL_VIDEO_CACHE_TTL_HOURS",
      24,
    );
    if (ttlHours <= 0) {
      return null;
    }

    return socialVideoTranscriptionRepository.findRecentCompletedByHash({
      inputHash,
      since: getSinceByHours(ttlHours),
    });
  }

  async createTask(input: CreateSocialVideoTranscriptionInput, authUserId: string) {
    await this.assertEnabled();
    await this.assertDailyLimit(authUserId);

    const sourceUrl = extractDouyinUrl(input.url);
    const normalizedUrl = normalizeUrlForHash(sourceUrl);
    const inputHash = createInputHash(input.platform, normalizedUrl);
    const cached = await this.findCached(inputHash);
    if (cached) {
      const copied = await socialVideoTranscriptionRepository.create({
        platform: input.platform,
        sourceUrl,
        normalizedUrl,
        inputHash,
        createdByAuthUserId: authUserId,
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
        title: cached.title,
        text: cached.text,
        segments: cached.segments,
        rawPayload: cached.raw_payload,
        completedAt: new Date().toISOString(),
      });
      return {
        ...serializeRecord(completed),
        cached: true,
      };
    }

    const task = await socialVideoTranscriptionRepository.create({
      platform: input.platform,
      sourceUrl,
      normalizedUrl,
      inputHash,
      createdByAuthUserId: authUserId,
    });

    void this.processTask(task.id).catch(() => {
      // processTask already records failure state.
    });

    return {
      ...serializeRecord(task),
      cached: false,
    };
  }

  async getTask(id: string, authUserId: string) {
    const task = await socialVideoTranscriptionRepository.findById(id);
    if (!task) {
      throw Errors.notFound("短视频识别任务不存在");
    }

    if (task.created_by_auth_user_id && task.created_by_auth_user_id !== authUserId) {
      throw Errors.forbidden();
    }

    return serializeRecord(task);
  }

  async processTask(id: string) {
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

          const asrResult = await tencentAsrGateway.transcribeAudioFile(audioFilePath);
          await socialVideoTranscriptionRepository.update(id, {
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
            audioDurationSeconds: asrResult.audioDurationSeconds ?? media.durationSeconds,
            completedAt: new Date().toISOString(),
            errorCode: null,
            errorMessage: null,
          });
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

      await socialVideoTranscriptionRepository.update(id, {
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
        completedAt: new Date().toISOString(),
        errorCode: null,
        errorMessage: null,
      });
    } catch (error) {
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
      });
    }
  }

  async testApify(input: TestSocialVideoTranscriptionInput) {
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
}

export const socialVideoTranscriptionService =
  new SocialVideoTranscriptionService();
