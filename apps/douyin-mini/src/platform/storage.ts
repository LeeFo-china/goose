import type { StoredSession } from "../models";

const SESSION_STORAGE_KEY = "gooes_douyin_session_v1";
const CUSTOMER_SESSION_STORAGE_KEY = "gooes_douyin_customer_session_v1";

export function readStoredSession(): StoredSession | null {
  const value: unknown = tt.getStorageSync(SESSION_STORAGE_KEY);
  return parseStoredSession(value);
}

export function parseStoredSession(value: unknown): StoredSession | null {
  if (!isRecord(value)) return null;
  const allowedKeys = new Set(["accessToken", "expiresAt", "mode", "phoneMasked"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return null;
  }
  if (typeof value.accessToken !== "string" || value.accessToken.length === 0
    || value.accessToken.length > 8_192
    || typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) return null;
  if (value.mode !== undefined && value.mode !== "customer"
    && value.mode !== "platform_visitor") return null;
  if (value.phoneMasked !== undefined && (typeof value.phoneMasked !== "string"
    || value.phoneMasked.length > 32)) return null;
  return {
    accessToken: value.accessToken,
    expiresAt: value.expiresAt,
    ...(value.mode ? { mode: value.mode } : {}),
    ...(value.phoneMasked ? { phoneMasked: value.phoneMasked } : {}),
  };
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

export function readStoredCustomerSession(): StoredSession | null {
  return parseStoredSession(tt.getStorageSync(CUSTOMER_SESSION_STORAGE_KEY));
}

export function writeStoredCustomerSession(session: StoredSession): void {
  tt.setStorageSync(CUSTOMER_SESSION_STORAGE_KEY, {
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    ...(session.mode ? { mode: session.mode } : {}),
    ...(session.phoneMasked ? { phoneMasked: session.phoneMasked } : {}),
  });
}

export function clearStoredCustomerSession(): void {
  tt.removeStorageSync(CUSTOMER_SESSION_STORAGE_KEY);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
