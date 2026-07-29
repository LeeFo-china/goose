import { createHmac } from "node:crypto";

import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";

export function hashVisitorOcrRequestIp(
  requestIp: string,
  rootSecret: string,
) {
  return createHmac("sha256", rootSecret)
    .update(`gooes:visitor-ocr-ip:v1:${requestIp}`)
    .digest("hex");
}

export function sanitizeVisitorOcrFailure(
  error: unknown,
  recognitionId: string,
) {
  const statusCode = readSafeStatusCode(error);
  const code = readSafeOcrCode(error);
  return Errors.business(
    statusCode,
    safeFailureMessage(code),
    code,
    { recognition_id: recognitionId },
  );
}

export function throwVisitorOcrQuotaExceeded(
  message: string,
  code: string,
  retryAfter?: number,
): never {
  throw Errors.business(429, message, code, {
    retry_after_seconds: Math.max(1, Math.floor(retryAfter ?? 1)),
  });
}

export function visitorOcrFileNotFound(): never {
  throw Errors.business(
    404,
    "OCR文件不存在",
    ErrorCodes.OCR_FILE_NOT_FOUND,
  );
}

export function visitorOcrRecognitionNotFound(): never {
  throw Errors.business(
    404,
    "OCR识别记录不存在",
    ErrorCodes.OCR_RECOGNITION_NOT_FOUND,
  );
}

export function visitorOcrRecognitionExpired(): never {
  throw Errors.business(
    410,
    "OCR识别结果已过期",
    ErrorCodes.OCR_RECOGNITION_EXPIRED,
  );
}

function readSafeStatusCode(error: unknown) {
  if (error instanceof AppError) return error.statusCode;
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    Number.isInteger(error.statusCode) &&
    Number(error.statusCode) >= 400 &&
    Number(error.statusCode) <= 599
  ) return Number(error.statusCode);
  return 502;
}

function readSafeOcrCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? error.code
    : null;
  return typeof code === "string" && /^OCR_[A-Z0-9_]+$/.test(code)
    ? code
    : ErrorCodes.OCR_PROVIDER_FAILED;
}

function safeFailureMessage(code: string) {
  if (code === ErrorCodes.OCR_PROVIDER_RATE_LIMITED) {
    return "OCR服务繁忙，请稍后重试";
  }
  if (code === ErrorCodes.OCR_RESULT_INVALID) return "OCR识别结果格式无效";
  return "OCR识别服务调用失败";
}
