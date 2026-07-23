import type { OcrNormalizedResult } from "./crypto";

export function buildResultSummary(result: OcrNormalizedResult) {
  return {
    field_keys: result.fields.map((field) => field.key),
    sensitive_field_count: result.fields.filter((field) => field.sensitive).length,
    warning_codes: result.warnings.map((warning) => warning.code),
  };
}

export function safeProviderFailure(error: unknown) {
  const details = error && typeof error === "object" && "details" in error &&
      error.details && typeof error.details === "object"
    ? error.details as Record<string, unknown>
    : {};
  return {
    providerRequestId: typeof details.requestId === "string" ? details.requestId : null,
    providerErrorCode: typeof details.providerCode === "string" ? details.providerCode : null,
    providerErrorMessageSafe: "腾讯云OCR调用失败",
  };
}

export function isUniqueConflict(error: unknown) {
  if (!error || typeof error !== "object" || !("details" in error)) return false;
  return JSON.stringify(error.details).includes("23505");
}

export function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  )).toISOString();
}

export function elapsed(now: number, startedAt: number) {
  return Math.max(0, Math.floor(now - startedAt));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
