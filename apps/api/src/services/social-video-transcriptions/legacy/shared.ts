import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  socialVideoTranscriptionRepository,
  type SocialVideoTranscriptionRecord,
  type SocialVideoTranscriptionSummaryRecord,
} from "@/repositories/social-video-transcriptions";
import {
  socialVideoScriptRepository,
  type SocialVideoScriptSummaryRecord,
} from "@/repositories/social-video-scripts";
import { SupabaseDB } from "@/utils/supabase";
import type {
  CreateSocialVideoTranscriptionInput,
  TestSocialVideoTranscriptionInput,
  ListSocialVideoTranscriptionsQuery,
} from "@/schema/social-video";
import { systemSettingsService } from "@/services/system-settings";
import { billingService } from "@/services/billing";
import { tencentAsrGateway } from "@/services/tencent-asr";

export type ApifyRunStatus = "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED-OUT" | "ABORTED";

export type ApifyRun = {
  id: string;
  status: ApifyRunStatus;
  defaultDatasetId?: string | null;
  statusMessage?: string | null;
};

export type ApifyRunResponse = {
  data?: ApifyRun;
  error?: {
    message?: string;
  };
};

export type ApifyTranscriptItem = {
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

export type TranscriptResult = {
  provider: "apify";
  actorId: string;
  runId: string;
  datasetId: string;
  title: string | null;
  text: string;
  segments: unknown[];
  durationSeconds: number | null;
  rawPayload: unknown;
};

export type {
  ListSocialVideoTranscriptionsQuery,
  SocialVideoScriptSummaryRecord,
  SocialVideoTranscriptionSummaryRecord,
};

export type MediaResolveResult = {
  actorId: string;
  runId: string;
  datasetId: string;
  title: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  rawPayload: unknown;
};

export const DOUYIN_URL_PATTERN = /https?:\/\/(?:v\.|www\.)?douyin\.com\/[^\s，。]+|https?:\/\/(?:www\.)?iesdouyin\.com\/[^\s，。]+/i;
export const APIFY_POLL_INTERVAL_MS = 1500;
export const execFileAsync = promisify(execFile);

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeActorIdForPath(actorId: string) {
  return actorId.trim().replace(/\//g, "~");
}

export function getApifyApiBaseUrl() {
  return "https://api.apify.com/v2";
}

export function getErrorMessage(input: unknown, fallback: string) {
  if (input && typeof input === "object" && "message" in input) {
    const message = (input as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

export function getFfmpegBinary() {
  return process.env.SOCIAL_VIDEO_FFMPEG_BIN || process.env.FFMPEG_BIN || "ffmpeg";
}

export function extractDouyinUrl(input: string) {
  const matched = input.match(DOUYIN_URL_PATTERN)?.[0];
  if (!matched) {
    throw Errors.badRequest("请输入有效的抖音视频链接");
  }

  return matched
    .trim()
    .replace(/[，。,.!?！？;；:：]+$/g, "");
}

export function normalizeUrlForHash(input: string) {
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

export function createInputHash(platform: string, normalizedUrl: string) {
  return createHash("sha256")
    .update(`${platform}:${normalizedUrl}`)
    .digest("hex");
}

export function getSinceByHours(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() - Math.max(hours, 0));
  return date.toISOString();
}

export function getTodayStartIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function serializeRecord(record: SocialVideoTranscriptionRecord, cached = false) {
  const durationSeconds = record.billing_duration_seconds ?? record.audio_duration_seconds;
  const reusedCachedResult = cached || record.billing_source === "cache";
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
    billing: {
      billable: record.billable,
      duration_seconds: durationSeconds,
      minutes: record.billing_minutes,
      source: record.billing_source,
      cached: reusedCachedResult,
      billed_at: record.billed_at,
      frozen_credits: record.billing_frozen_credits,
      correlation_id: record.billing_correlation_id,
      event_id: record.billing_event_id,
      charged: record.billing_charged,
      charged_at: record.billing_charged_at,
    },
    error_code: record.error_code,
    error_message: record.error_message,
    created_at: record.created_at,
    updated_at: record.updated_at,
    completed_at: record.completed_at,
  };
}

export function serializeRecordSummary(input: {
  record: SocialVideoTranscriptionSummaryRecord;
  scripts: SocialVideoScriptSummaryRecord[];
}) {
  const durationSeconds = input.record.billing_duration_seconds
    ?? input.record.audio_duration_seconds;
  const cached = input.record.billing_source === "cache";
  const text = typeof input.record.text === "string" ? input.record.text : "";
  const latestScript = input.scripts[0] ?? null;

  return {
    id: input.record.id,
    platform: input.record.platform,
    source_url: input.record.source_url,
    normalized_url: input.record.normalized_url,
    status: input.record.status,
    progress: input.record.progress,
    title: input.record.title,
    text_preview: text.slice(0, 80),
    text_length: text.length,
    audio_duration_seconds: input.record.audio_duration_seconds,
    cached,
    billing: {
      billable: input.record.billable,
      duration_seconds: durationSeconds,
      minutes: input.record.billing_minutes,
      source: input.record.billing_source,
      cached,
      billed_at: input.record.billed_at,
      frozen_credits: input.record.billing_frozen_credits,
      correlation_id: input.record.billing_correlation_id,
      event_id: input.record.billing_event_id,
      charged: input.record.billing_charged,
      charged_at: input.record.billing_charged_at,
    },
    script_count: input.scripts.length,
    latest_script: latestScript
      ? {
        id: latestScript.id,
        title: latestScript.title,
        target_platform: latestScript.target_platform,
        style: latestScript.style,
        status: latestScript.status,
        created_at: latestScript.created_at,
      }
      : null,
    created_at: input.record.created_at,
    updated_at: input.record.updated_at,
    completed_at: input.record.completed_at,
  };
}

export function extractTranscriptItem(items: unknown): ApifyTranscriptItem {
  if (!Array.isArray(items) || items.length === 0) {
    throw Errors.business(502, "Apify 未返回识别结果", "APIFY_EMPTY_RESULT");
  }

  const first = items[0];
  if (!first || typeof first !== "object") {
    throw Errors.business(502, "Apify 返回结果格式异常", "APIFY_INVALID_RESULT");
  }

  return first as ApifyTranscriptItem;
}

export function normalizeSegments(input: unknown) {
  return Array.isArray(input) ? input : [];
}

export function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function calculateBilling(input: {
  durationSeconds: number | null;
  source: string | null;
}) {
  if (typeof input.durationSeconds !== "number" || !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    return {
      billingDurationSeconds: null,
      billingMinutes: null,
      billingSource: input.source,
      billedAt: null,
    };
  }

  return {
    billingDurationSeconds: Number(input.durationSeconds.toFixed(2)),
    billingMinutes: Math.max(1, Math.ceil(input.durationSeconds / 60)),
    billingSource: input.source,
    billedAt: new Date().toISOString(),
  };
}

export function isSocialVideoChargeEnabled() {
  return String(process.env.SOCIAL_VIDEO_CHARGE_ENABLED || "").toLowerCase() === "true";
}

export function normalizeTranscriptText(item: ApifyTranscriptItem) {
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

export function assertDownloadableMediaUrl(input: string) {
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

export async function downloadMediaToFile(input: {
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

export async function extractAudioWithFfmpeg(input: {
  mediaFilePath: string;
  audioFilePath: string;
  timeoutMs: number;
  bitrate: string;
}) {
  try {
    await execFileAsync(getFfmpegBinary(), [
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

export {
  Errors,
  SupabaseDB,
  accessPolicyService,
  billingService,
  socialVideoScriptRepository,
  socialVideoTranscriptionRepository,
  systemSettingsService,
  tencentAsrGateway,
};

export type {
  AuthContext,
  CreateSocialVideoTranscriptionInput,
  SocialVideoTranscriptionRecord,
  TestSocialVideoTranscriptionInput,
};
