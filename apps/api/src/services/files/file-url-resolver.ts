import COS from "cos-nodejs-sdk-v5";
import { SupabaseDB } from "@/utils/supabase";
import { systemSettingsService } from "@/services/system-settings";

const LEGACY_PROJECT_LOGS_BUCKET = "project-logs";
const COS_PUBLIC_BASE_URL_CACHE_TTL_MS = 30 * 1000;
const DEFAULT_COS_REGION = "ap-guangzhou";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 1800;
const DEFAULT_FILE_ACCESS_POLICY: PlatformFileAccessPolicy = {
  default: {
    access_mode: "signed",
    signed_url_ttl_seconds: DEFAULT_SIGNED_URL_TTL_SECONDS,
  },
  scenes: {
    project_log: {
      access_mode: "signed",
      signed_url_ttl_seconds: 1800,
    },
    project_log_comment: {
      access_mode: "signed",
      signed_url_ttl_seconds: 1800,
    },
    project_acceptance: {
      access_mode: "signed",
      signed_url_ttl_seconds: 1800,
    },
    customer_follow_up_comment: {
      access_mode: "signed",
      signed_url_ttl_seconds: 1800,
    },
    customer_service: {
      access_mode: "signed",
      signed_url_ttl_seconds: 1800,
    },
    customer_douyin_screenshot: {
      access_mode: "signed",
      signed_url_ttl_seconds: 1800,
    },
    expense_request: {
      access_mode: "signed",
      signed_url_ttl_seconds: 600,
    },
    expense_request_settlement: {
      access_mode: "signed",
      signed_url_ttl_seconds: 600,
    },
    referral_payment: {
      access_mode: "signed",
      signed_url_ttl_seconds: 600,
    },
    employee_avatar: {
      access_mode: "signed",
      signed_url_ttl_seconds: 21600,
    },
    customer_avatar: {
      access_mode: "signed",
      signed_url_ttl_seconds: 21600,
    },
    h5_marketing_page: {
      access_mode: "public",
      signed_url_ttl_seconds: 0,
    },
    panorama_tiles: {
      access_mode: "public",
      signed_url_ttl_seconds: 0,
    },
  },
};

type PlatformFileAccessMode = "public" | "signed";

type PlatformFileAccessRule = {
  access_mode: PlatformFileAccessMode;
  signed_url_ttl_seconds?: number;
};

type PlatformFileAccessPolicy = {
  default: PlatformFileAccessRule;
  scenes: Record<string, PlatformFileAccessRule>;
};

type CachedCosAccessConfig = {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  publicBaseUrl: string;
  signedUrlTtlSeconds: number;
  policy: PlatformFileAccessPolicy;
};

let cachedPlatformCosPublicBaseUrl = (
  process.env.PLATFORM_COS_PUBLIC_BASE_URL ||
  process.env.COS_PUBLIC_BASE_URL ||
  ""
).trim().replace(/\/+$/, "");
let cachedCosAccessConfig: CachedCosAccessConfig | null = null;
let cosClient: COS | null = null;
let cacheExpiresAt = 0;
let refreshPromise: Promise<void> | null = null;

function trimSlashes(value: string) {
  return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

export function setPlatformCosPublicBaseUrlCache(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\/+$/, "");
  if (!normalized) {
    return;
  }

  cachedPlatformCosPublicBaseUrl = normalized;
  if (cachedCosAccessConfig) {
    cachedCosAccessConfig.publicBaseUrl = normalized;
  }
  cacheExpiresAt = Date.now() + COS_PUBLIC_BASE_URL_CACHE_TTL_MS;
}

export function setPlatformCosAccessConfigCache(input: {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  publicBaseUrl?: string | null;
  signedUrlTtlSeconds?: number | null;
  policyText?: string | null;
}) {
  const normalizedPublicBaseUrl = (input.publicBaseUrl || "").trim().replace(/\/+$/, "");
  const ttl = input.signedUrlTtlSeconds || DEFAULT_SIGNED_URL_TTL_SECONDS;
  cachedPlatformCosPublicBaseUrl = normalizedPublicBaseUrl;
  cachedCosAccessConfig = {
    secretId: input.secretId,
    secretKey: input.secretKey,
    bucket: input.bucket,
    region: input.region,
    publicBaseUrl: normalizedPublicBaseUrl,
    signedUrlTtlSeconds: ttl,
    policy: parseAccessPolicy(
      input.policyText || JSON.stringify(DEFAULT_FILE_ACCESS_POLICY),
      ttl,
    ),
  };
  cosClient = null;
  cacheExpiresAt = Date.now() + COS_PUBLIC_BASE_URL_CACHE_TTL_MS;
}

export function refreshPlatformCosPublicBaseUrlCache() {
  if (!refreshPromise) {
    refreshPromise = Promise.all([
      systemSettingsService.getSecretString("TENCENT_COS_SECRET_ID"),
      systemSettingsService.getSecretString("TENCENT_COS_SECRET_KEY"),
      systemSettingsService.getString("PLATFORM_COS_BUCKET"),
      systemSettingsService.getString("PLATFORM_COS_REGION", DEFAULT_COS_REGION),
      systemSettingsService.getString("PLATFORM_COS_PUBLIC_BASE_URL", cachedPlatformCosPublicBaseUrl),
      systemSettingsService.getNumber(
        "PLATFORM_COS_SIGNED_URL_TTL_SECONDS",
        DEFAULT_SIGNED_URL_TTL_SECONDS,
      ),
      systemSettingsService.getString(
        "PLATFORM_FILE_ACCESS_POLICY",
        JSON.stringify(DEFAULT_FILE_ACCESS_POLICY),
      ),
    ])
      .then(([
        secretId,
        secretKey,
        bucket,
        region,
        publicBaseUrl,
        signedUrlTtlSeconds,
        policyText,
      ]) => {
        const normalizedPublicBaseUrl = publicBaseUrl.trim().replace(/\/+$/, "");
        cachedPlatformCosPublicBaseUrl = normalizedPublicBaseUrl;
        if (secretId && secretKey && bucket && region) {
          cachedCosAccessConfig = {
            secretId,
            secretKey,
            bucket,
            region,
            publicBaseUrl: normalizedPublicBaseUrl,
            signedUrlTtlSeconds,
            policy: parseAccessPolicy(policyText, signedUrlTtlSeconds),
          };
          cosClient = null;
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

  return refreshPromise;
}

function getPlatformCosPublicBaseUrl() {
  if (Date.now() >= cacheExpiresAt) {
    refreshPlatformCosPublicBaseUrlCache();
  }

  return cachedPlatformCosPublicBaseUrl;
}

function parseAccessRule(value: unknown, fallback: PlatformFileAccessRule) {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const row = value as Record<string, unknown>;
  const accessMode = row.access_mode === "public" || row.access_mode === "signed"
    ? row.access_mode
    : fallback.access_mode;
  const ttl = Number(row.signed_url_ttl_seconds);

  return {
    access_mode: accessMode,
    signed_url_ttl_seconds: Number.isFinite(ttl) && ttl > 0
      ? Math.floor(ttl)
      : fallback.signed_url_ttl_seconds,
  };
}

function parseAccessPolicy(value: string, fallbackTtlSeconds: number) {
  const fallback: PlatformFileAccessPolicy = {
    default: {
      ...DEFAULT_FILE_ACCESS_POLICY.default,
      signed_url_ttl_seconds: fallbackTtlSeconds || DEFAULT_SIGNED_URL_TTL_SECONDS,
    },
    scenes: DEFAULT_FILE_ACCESS_POLICY.scenes,
  };

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }

    const row = parsed as Record<string, unknown>;
    const defaultRule = parseAccessRule(row.default, fallback.default);
    const scenes = { ...fallback.scenes };
    const rawScenes = row.scenes;
    if (rawScenes && typeof rawScenes === "object" && !Array.isArray(rawScenes)) {
      for (const [scene, rule] of Object.entries(rawScenes)) {
        scenes[normalizeSceneCode(scene)] = parseAccessRule(
          rule,
          scenes[normalizeSceneCode(scene)] || defaultRule,
        );
      }
    }

    return {
      default: defaultRule,
      scenes,
    };
  } catch {
    return fallback;
  }
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

function getObjectKeyFromCosUrl(value: string) {
  try {
    const parsed = new URL(value);
    const publicBaseUrl = getPlatformCosPublicBaseUrl();
    const publicBaseHost = publicBaseUrl ? new URL(publicBaseUrl).host : "";
    const isConfiguredCosHost = publicBaseHost && parsed.host === publicBaseHost;
    const isTencentCosHost = parsed.host.includes(".cos.") ||
      parsed.host.endsWith(".myqcloud.com");

    if (!isConfiguredCosHost && !isTencentCosHost) {
      return null;
    }

    const objectKey = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    return isLikelyPlatformCosObjectKey(objectKey) ? objectKey : null;
  } catch {
    return null;
  }
}

function normalizeSceneCode(value: string) {
  return value.trim().replace(/-/g, "_");
}

function inferSceneFromObjectKey(objectKey: string) {
  const parts = trimSlashes(objectKey).split("/");
  if (parts[0] === "tenants" && parts.length >= 3) {
    return normalizeSceneCode(parts[2] || "");
  }

  if ((parts[0] === "public" || parts[0] === "system") && parts.length >= 2) {
    return normalizeSceneCode(parts[1] || "");
  }

  return "";
}

function getAccessRuleForObjectKey(objectKey: string) {
  const config = cachedCosAccessConfig;
  if (!config) {
    return DEFAULT_FILE_ACCESS_POLICY.default;
  }

  const scene = inferSceneFromObjectKey(objectKey);
  return config.policy.scenes[scene] || config.policy.default;
}

function getCosClient(config: CachedCosAccessConfig) {
  if (!cosClient) {
    cosClient = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
    });
  }

  return cosClient;
}

function getSignedCosUrl(objectKey: string) {
  const config = cachedCosAccessConfig;
  if (!config) {
    return null;
  }

  const rule = getAccessRuleForObjectKey(objectKey);
  const expires = rule.signed_url_ttl_seconds ||
    config.signedUrlTtlSeconds ||
    DEFAULT_SIGNED_URL_TTL_SECONDS;

  return getCosClient(config).getObjectUrl({
    Bucket: config.bucket,
    Region: config.region,
    Key: trimSlashes(objectKey),
    Sign: true,
    Expires: expires,
    Protocol: "https:",
  });
}

function getPublicCosUrl(objectKey: string) {
  const publicBaseUrl = getPlatformCosPublicBaseUrl();
  if (!publicBaseUrl) {
    return null;
  }

  return `${publicBaseUrl}/${encodeObjectKey(objectKey)}`;
}

export function resolveStoredFileUrl(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (isHttpUrl(normalized)) {
    const objectKey = getObjectKeyFromCosUrl(normalized);
    if (objectKey) {
      const rule = getAccessRuleForObjectKey(objectKey);
      if (rule.access_mode === "signed") {
        const signedUrl = getSignedCosUrl(objectKey);
        if (signedUrl) {
          return signedUrl;
        }
      }

      return getPublicCosUrl(objectKey) || normalized;
    }

    return normalized;
  }

  if (isLikelyPlatformCosObjectKey(normalized)) {
    const rule = getAccessRuleForObjectKey(normalized);
    if (rule.access_mode === "signed") {
      const signedUrl = getSignedCosUrl(normalized);
      if (signedUrl) {
        return signedUrl;
      }
    }

    return getPublicCosUrl(normalized) || normalized;
  }

  return SupabaseDB.getAdminClient()
    .storage
    .from(LEGACY_PROJECT_LOGS_BUCKET)
    .getPublicUrl(normalized)
    .data.publicUrl;
}

export function resolveStoredFileUrlList(value: unknown) {
  let listValue = value;
  if (typeof value === "string") {
    try {
      listValue = JSON.parse(value) as unknown;
    } catch {
      listValue = value;
    }
  }

  if (!Array.isArray(listValue)) {
    return [] as string[];
  }

  return listValue
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolveStoredFileUrl(item) || item);
}
