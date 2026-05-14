import { SupabaseDB } from "@/utils/supabase";
import { systemSettingsService } from "@/services/system-settings";

const LEGACY_PROJECT_LOGS_BUCKET = "project-logs";
const COS_PUBLIC_BASE_URL_CACHE_TTL_MS = 30 * 1000;

let cachedPlatformCosPublicBaseUrl = (
  process.env.PLATFORM_COS_PUBLIC_BASE_URL ||
  process.env.COS_PUBLIC_BASE_URL ||
  ""
).trim().replace(/\/+$/, "");
let cacheExpiresAt = 0;
let refreshPromise: Promise<void> | null = null;

function trimSlashes(value: string) {
  return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

function refreshPlatformCosPublicBaseUrlCache() {
  if (refreshPromise) {
    return;
  }

  refreshPromise = systemSettingsService
    .getString("PLATFORM_COS_PUBLIC_BASE_URL", cachedPlatformCosPublicBaseUrl)
    .then((value) => {
      const normalized = value.trim().replace(/\/+$/, "");
      if (normalized) {
        cachedPlatformCosPublicBaseUrl = normalized;
      }
      cacheExpiresAt = Date.now() + COS_PUBLIC_BASE_URL_CACHE_TTL_MS;
    })
    .catch(() => {
      cacheExpiresAt = Date.now() + 5 * 1000;
    })
    .finally(() => {
      refreshPromise = null;
    });
}

function getPlatformCosPublicBaseUrl() {
  if (Date.now() >= cacheExpiresAt) {
    refreshPlatformCosPublicBaseUrlCache();
  }

  return cachedPlatformCosPublicBaseUrl;
}

function encodeObjectKey(objectKey: string) {
  return trimSlashes(objectKey)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function isLikelyPlatformCosObjectKey(value: string) {
  const normalized = trimSlashes(value);
  return (
    normalized.startsWith("tenants/") ||
    normalized.startsWith("public/") ||
    normalized.startsWith("system/")
  );
}

export function resolveStoredFileUrl(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (isHttpUrl(normalized)) {
    return normalized;
  }

  if (isLikelyPlatformCosObjectKey(normalized)) {
    const publicBaseUrl = getPlatformCosPublicBaseUrl();
    if (publicBaseUrl) {
      return `${publicBaseUrl}/${encodeObjectKey(normalized)}`;
    }

    return normalized;
  }

  return SupabaseDB.getAdminClient()
    .storage
    .from(LEGACY_PROJECT_LOGS_BUCKET)
    .getPublicUrl(normalized)
    .data.publicUrl;
}

export function resolveStoredFileUrlList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolveStoredFileUrl(item) || item);
}
