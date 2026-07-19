const DEFAULT_PREPAY_REQUEST_TIMEOUT_MS = 10_000;
const MIN_PREPAY_REQUEST_TIMEOUT_MS = 1;
const MAX_PREPAY_REQUEST_TIMEOUT_MS = 60_000;

export function normalizeWechatPayPrepayRequestTimeout(
  timeoutMs: number | undefined,
): number {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    return DEFAULT_PREPAY_REQUEST_TIMEOUT_MS;
  }
  return Math.max(
    MIN_PREPAY_REQUEST_TIMEOUT_MS,
    Math.min(Math.floor(timeoutMs), MAX_PREPAY_REQUEST_TIMEOUT_MS),
  );
}
