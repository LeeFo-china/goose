import type { StoredSession } from "../models";

const SESSION_STORAGE_KEY = "gooes_douyin_session_v1";

export function readStoredSession(): StoredSession | null {
  const value: unknown = tt.getStorageSync(SESSION_STORAGE_KEY);
  return parseStoredSession(value);
}

export function parseStoredSession(value: unknown): StoredSession | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => key !== "accessToken" && key !== "expiresAt")) {
    return null;
  }
  return typeof value.accessToken === "string" && value.accessToken.length > 0
    && value.accessToken.length <= 8_192
    && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt)
    ? { accessToken: value.accessToken, expiresAt: value.expiresAt }
    : null;
}

export function writeStoredSession(session: StoredSession): void {
  tt.setStorageSync(SESSION_STORAGE_KEY, {
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
  });
}

export function clearStoredSession(): void {
  tt.removeStorageSync(SESSION_STORAGE_KEY);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
