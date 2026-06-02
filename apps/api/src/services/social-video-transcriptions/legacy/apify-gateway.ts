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
  sleep,
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

export class ApifyTranscriptGateway {
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
      durationSeconds: readNumber(item.duration),
      rawPayload: item,
    };
  }
}
