import { ApiRequestError } from "../../api/request";

export function isPrivacyVersionMismatch(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError
    && (error.code === "DOUYIN_PRIVACY_POLICY_VERSION_MISMATCH"
      || error.code === "DOUYIN_MEASUREMENT_PRIVACY_VERSION_MISMATCH");
}

export function readableError(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError && error.message.trim()
    ? error.message
    : fallback;
}
