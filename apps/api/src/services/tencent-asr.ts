import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Errors } from "@/errors/error-factory";
import { systemSettingsService } from "@/services/system-settings";

const API_VERSION = "2019-06-14";
const SERVICE = "asr";
const DEFAULT_ENDPOINT = "asr.tencentcloudapi.com";
const DEFAULT_REGION = "ap-shanghai";
const DEFAULT_ENGINE_MODEL_TYPE = "16k_zh";
const DEFAULT_RES_TEXT_FORMAT = 3;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_POLL_TIMEOUT_MS = 180000;
const MAX_DATA_BYTES = 5 * 1024 * 1024;

type TencentApiError = {
  Code?: string;
  Message?: string;
};

type TencentApiResponse<T> = {
  Response?: T & {
    Error?: TencentApiError;
    RequestId?: string;
  };
};

type CreateRecTaskResponse = {
  Data?: {
    TaskId?: number;
  };
  RequestId?: string;
};

type DescribeTaskStatusResponse = {
  Data?: {
    TaskId?: number;
    Status?: number;
    StatusStr?: string;
    AudioDuration?: number;
    Result?: string;
    ErrorMsg?: string;
    ResultDetail?: unknown[];
  };
  RequestId?: string;
};

export type TencentAsrTranscriptionResult = {
  provider: "tencent_asr";
  taskId: string;
  text: string;
  segments: unknown[];
  rawPayload: unknown;
  audioDurationSeconds: number | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function formatUtcDate(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function normalizeEndpoint(value: string) {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") ||
    DEFAULT_ENDPOINT;
}

function getTencentErrorMessage(error: TencentApiError | undefined) {
  if (!error) return "腾讯云语音识别接口调用失败";
  return `${error.Code || "Unknown"}: ${error.Message || "腾讯云语音识别接口调用失败"}`;
}

async function getRequiredSecretConfig(key: string) {
  const value = await systemSettingsService.getSecretString(key);
  if (!value) {
    throw Errors.business(
      503,
      "腾讯云语音识别暂未配置",
      "TENCENT_ASR_CONFIG_MISSING",
      { key },
    );
  }

  return value;
}

function normalizeTextFromResult(input: {
  result?: string;
  resultDetail?: unknown[];
}) {
  if (Array.isArray(input.resultDetail) && input.resultDetail.length > 0) {
    const text = input.resultDetail
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const sentence = (item as { FinalSentence?: unknown }).FinalSentence;
        return typeof sentence === "string" ? sentence.trim() : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }

  if (typeof input.result === "string" && input.result.trim()) {
    return input.result
      .replace(/^\[[^\]]+\]\s*/gm, "")
      .trim();
  }

  return "";
}

class TencentAsrGateway {
  private async getConfig() {
    const [secretId, secretKey, region, endpoint, engineModelType, resTextFormat] =
      await Promise.all([
        getRequiredSecretConfig("TENCENTCLOUD_SECRET_ID"),
        getRequiredSecretConfig("TENCENTCLOUD_SECRET_KEY"),
        systemSettingsService.getString("TENCENT_ASR_REGION", DEFAULT_REGION),
        systemSettingsService.getString("TENCENT_ASR_ENDPOINT", DEFAULT_ENDPOINT),
        systemSettingsService.getString("TENCENT_ASR_ENGINE_MODEL_TYPE", DEFAULT_ENGINE_MODEL_TYPE),
        systemSettingsService.getNumber("TENCENT_ASR_RES_TEXT_FORMAT", DEFAULT_RES_TEXT_FORMAT),
      ]);

    return {
      secretId,
      secretKey,
      region,
      endpoint: normalizeEndpoint(endpoint),
      engineModelType,
      resTextFormat,
    };
  }

  private async request<T>(
    action: string,
    payload: Record<string, unknown>,
  ): Promise<T & { RequestId?: string }> {
    const config = await this.getConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const date = formatUtcDate(timestamp);
    const body = JSON.stringify(payload);
    const canonicalHeaders = [
      "content-type:application/json; charset=utf-8",
      `host:${config.endpoint}`,
      `x-tc-action:${action.toLowerCase()}`,
      "",
    ].join("\n");
    const signedHeaders = "content-type;host;x-tc-action";
    const canonicalRequest = [
      "POST",
      "/",
      "",
      canonicalHeaders,
      signedHeaders,
      sha256(body),
    ].join("\n");
    const credentialScope = `${date}/${SERVICE}/tc3_request`;
    const stringToSign = [
      "TC3-HMAC-SHA256",
      String(timestamp),
      credentialScope,
      sha256(canonicalRequest),
    ].join("\n");
    const secretDate = hmac(`TC3${config.secretKey}`, date);
    const secretService = hmac(secretDate, SERVICE);
    const secretSigning = hmac(secretService, "tc3_request");
    const signature = hmacHex(secretSigning, stringToSign);
    const authorization =
      `TC3-HMAC-SHA256 Credential=${config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    let response: Response;
    try {
      response = await fetch(`https://${config.endpoint}`, {
        method: "POST",
        headers: {
          "Authorization": authorization,
          "Content-Type": "application/json; charset=utf-8",
          "Host": config.endpoint,
          "X-TC-Action": action,
          "X-TC-Version": API_VERSION,
          "X-TC-Timestamp": String(timestamp),
          "X-TC-Region": config.region,
        },
        body,
      });
    } catch (error) {
      throw Errors.business(
        503,
        "腾讯云语音识别服务暂时不可用",
        "TENCENT_ASR_API_UNAVAILABLE",
        error instanceof Error ? { message: error.message } : undefined,
      );
    }

    const result = await response.json().catch(() => ({})) as TencentApiResponse<T>;
    const apiResponse = result.Response;
    if (!response.ok || apiResponse?.Error || !apiResponse) {
      throw Errors.business(
        503,
        getTencentErrorMessage(apiResponse?.Error),
        "TENCENT_ASR_API_ERROR",
        apiResponse?.Error,
      );
    }

    return apiResponse;
  }

  private async createTask(audioFilePath: string) {
    const audio = await readFile(audioFilePath);
    if (audio.byteLength > MAX_DATA_BYTES) {
      throw Errors.business(
        413,
        "音频文件超过腾讯云本地音频 5MB 限制",
        "TENCENT_ASR_DATA_TOO_LARGE",
        { bytes: audio.byteLength, maxBytes: MAX_DATA_BYTES },
      );
    }

    const config = await this.getConfig();
    const response = await this.request<CreateRecTaskResponse>("CreateRecTask", {
      EngineModelType: config.engineModelType,
      ChannelNum: 1,
      ResTextFormat: config.resTextFormat,
      SourceType: 1,
      Data: audio.toString("base64"),
      DataLen: audio.byteLength,
      ConvertNumMode: 1,
      FilterDirty: 0,
      FilterPunc: 0,
      FilterModal: 0,
    });
    const taskId = response.Data?.TaskId;
    if (typeof taskId !== "number") {
      throw Errors.business(502, "腾讯云语音识别未返回 TaskId", "TENCENT_ASR_TASK_MISSING");
    }

    return String(taskId);
  }

  private async describeTask(taskId: string) {
    return this.request<DescribeTaskStatusResponse>("DescribeTaskStatus", {
      TaskId: Number(taskId),
    });
  }

  async transcribeAudioFile(
    audioFilePath: string,
    input?: {
      onTaskCreated?: (taskId: string) => Promise<void> | void;
    },
  ): Promise<TencentAsrTranscriptionResult> {
    const taskId = await this.createTask(audioFilePath);
    await input?.onTaskCreated?.(taskId);
    const pollTimeoutMs = await systemSettingsService.getNumber(
      "TENCENT_ASR_POLL_TIMEOUT_MS",
      DEFAULT_POLL_TIMEOUT_MS,
    );
    const startedAt = Date.now();

    while (Date.now() - startedAt <= pollTimeoutMs) {
      await sleep(DEFAULT_POLL_INTERVAL_MS);
      const response = await this.describeTask(taskId);
      const data = response.Data;
      const status = data?.StatusStr;

      if (status === "success" || data?.Status === 2) {
        const segments = Array.isArray(data?.ResultDetail) ? data.ResultDetail : [];
        const text = normalizeTextFromResult({
          result: data?.Result,
          resultDetail: segments,
        });
        if (!text) {
          throw Errors.business(502, "腾讯云语音识别结果为空", "TENCENT_ASR_EMPTY_RESULT");
        }

        return {
          provider: "tencent_asr",
          taskId,
          text,
          segments,
          rawPayload: response,
          audioDurationSeconds: typeof data?.AudioDuration === "number" ? data.AudioDuration : null,
        };
      }

      if (status === "failed" || data?.Status === 3) {
        throw Errors.business(
          502,
          data?.ErrorMsg || "腾讯云语音识别失败",
          "TENCENT_ASR_TASK_FAILED",
          { taskId },
        );
      }
    }

    throw Errors.business(504, "腾讯云语音识别轮询超时", "TENCENT_ASR_TIMEOUT", { taskId });
  }
}

export const tencentAsrGateway = new TencentAsrGateway();
