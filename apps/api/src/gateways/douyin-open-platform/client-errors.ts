import { z } from "zod";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { SafeDouyinLogIdSchema } from "./release-client";

const EXPIRED_ACCESS_TOKEN_ERROR = 28_001_008;
const RETRIEVE_AUTHORIZATION_EXPIRED_ERRORS = new Set([40_004, 40_022]);
const OpenApiEnvelopeSchema = z.looseObject({
  err_no: z.number().int(),
  log_id: z.string().min(1).optional(),
});
const SafeLogSchema = z.looseObject({ log_id: SafeDouyinLogIdSchema.optional() });

export function assertOpenApiSuccess(body: Record<string, unknown>): void {
  const envelope = OpenApiEnvelopeSchema.safeParse(body);
  if (!envelope.success) throw invalidResponseError(safeLogId(body));
  if (envelope.data.err_no === 0) return;
  const code = envelope.data.err_no === EXPIRED_ACCESS_TOKEN_ERROR
    ? "DOUYIN_OPEN_PLATFORM_ACCESS_TOKEN_EXPIRED"
    : "DOUYIN_OPEN_PLATFORM_API_ERROR";
  throw openPlatformError(code, "抖音开放平台请求失败", safeLogId(body));
}

export function assertRetrieveAuthorizationSuccess(body: Record<string, unknown>): void {
  const envelope = OpenApiEnvelopeSchema.safeParse(body);
  if (envelope.success && RETRIEVE_AUTHORIZATION_EXPIRED_ERRORS.has(envelope.data.err_no)) {
    throw Errors.business(
      401,
      "抖音小程序需要重新授权",
      "DOUYIN_AUTHORIZATION_EXPIRED",
      safeLogId(body) ? { log_id: safeLogId(body) } : undefined,
    );
  }
  assertOpenApiSuccess(body);
}

export function safeLogId(body: unknown): string | undefined {
  const parsed = SafeLogSchema.safeParse(body);
  return parsed.success ? parsed.data.log_id : undefined;
}

export function invalidResponseError(logId?: string): AppError {
  return openPlatformError(
    "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID",
    "抖音开放平台响应格式无效",
    logId,
  );
}

export function accessTokenRefreshError(): AppError {
  return openPlatformError(
    "DOUYIN_OPEN_PLATFORM_ACCESS_TOKEN_REFRESH_FAILED",
    "抖音开放平台访问凭证刷新失败",
  );
}

export function openPlatformError(code: string, message: string, logId?: string): AppError {
  return Errors.business(502, message, code, logId ? { log_id: logId } : undefined);
}
