import { verifyToken } from "@/utils/jwt";
import type { VerifiedJwtPayload } from "./types";

const DEFAULT_WECHAT_IDENTITY_CHECK_CACHE_TTL_MS = 30_000;
const MAX_WECHAT_IDENTITY_CHECK_CACHE_TTL_MS = 60_000;
const MAX_WECHAT_IDENTITY_CHECK_CACHE_SIZE = 4_000;

const wechatIdentityCheckCache = new Map<string, { expiresAt: number; result?: unknown }>();
const wechatIdentityCheckInFlight = new Map<string, Promise<unknown>>();
let wechatIdentityCheckCacheGeneration = 0;

export function invalidateWechatIdentityCheckCache(input: {
  authUserId: string;
  openid?: string | null;
}): void {
  wechatIdentityCheckCacheGeneration += 1;
  const keys = new Set([
    ...wechatIdentityCheckCache.keys(),
    ...wechatIdentityCheckInFlight.keys(),
  ]);

  for (const key of keys) {
    const [, authUserId, openid] = key.split(":");
    if (
      authUserId === input.authUserId &&
      (!input.openid || openid === input.openid)
    ) {
      wechatIdentityCheckCache.delete(key);
      wechatIdentityCheckInFlight.delete(key);
    }
  }
}

function getWechatIdentityCheckCacheTtlMs() {
  const parsed = Number(process.env.WECHAT_IDENTITY_CHECK_CACHE_TTL_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WECHAT_IDENTITY_CHECK_CACHE_TTL_MS;
  }

  return Math.min(parsed, MAX_WECHAT_IDENTITY_CHECK_CACHE_TTL_MS);
}

function pruneWechatIdentityCheckCache(now: number) {
  if (wechatIdentityCheckCache.size < MAX_WECHAT_IDENTITY_CHECK_CACHE_SIZE) {
    return;
  }

  for (const [key, value] of wechatIdentityCheckCache.entries()) {
    if (value.expiresAt <= now) {
      wechatIdentityCheckCache.delete(key);
    }
  }

  if (wechatIdentityCheckCache.size >= MAX_WECHAT_IDENTITY_CHECK_CACHE_SIZE) {
    wechatIdentityCheckCache.clear();
  }
}

export function buildWechatIdentityCheckCacheKey(
  kind: "oauth" | "business" | "binding" | "bootstrap",
  payload: VerifiedJwtPayload,
) {
  return [
    kind,
    payload.sub,
    payload.openid ?? "",
    payload.tenant_id ?? "",
    payload.customer_id ?? "",
    payload.employee_id ?? "",
  ].join(":");
}

function hasWechatIdentityCheckCache(key: string) {
  const cached = wechatIdentityCheckCache.get(key);
  if (!cached) {
    return false;
  }

  if (cached.expiresAt <= Date.now()) {
    wechatIdentityCheckCache.delete(key);
    wechatIdentityCheckInFlight.delete(key);
    return false;
  }

  return true;
}

function setWechatIdentityCheckCache(
  key: string,
  payload: VerifiedJwtPayload,
  result?: unknown,
) {
  const now = Date.now();
  pruneWechatIdentityCheckCache(now);

  const tokenExpiresAt = payload.exp ? payload.exp * 1000 : Number.POSITIVE_INFINITY;
  const expiresAt = Math.min(
    now + getWechatIdentityCheckCacheTtlMs(),
    tokenExpiresAt,
  );

  if (expiresAt > now) {
    wechatIdentityCheckCache.set(key, { expiresAt, result });
  }
}

export async function runWechatIdentityCheckOnce<T>(
  cacheKey: string,
  payload: VerifiedJwtPayload,
  handler: () => Promise<T>,
): Promise<T | undefined> {
  if (hasWechatIdentityCheckCache(cacheKey)) {
    return wechatIdentityCheckCache.get(cacheKey)?.result as T | undefined;
  }

  const inFlight = wechatIdentityCheckInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight as Promise<T | undefined>;
  }

  const cacheGeneration = wechatIdentityCheckCacheGeneration;
  const request = handler()
    .then((result) => {
      if (cacheGeneration === wechatIdentityCheckCacheGeneration) {
        setWechatIdentityCheckCache(cacheKey, payload, result);
      }
      return result;
    })
    .finally(() => {
      if (wechatIdentityCheckInFlight.get(cacheKey) === request) {
        wechatIdentityCheckInFlight.delete(cacheKey);
      }
  });
  wechatIdentityCheckInFlight.set(cacheKey, request);
  return request;
}

export function primeWechatIdentityCheckCacheFromToken(token: string) {
  const payload = verifyToken(token);
  if (!payload?.sub || !payload.openid) {
    return;
  }

  setWechatIdentityCheckCache(
    buildWechatIdentityCheckCacheKey("oauth", payload),
    payload,
  );
  setWechatIdentityCheckCache(
    buildWechatIdentityCheckCacheKey("binding", payload),
    payload,
  );

  if (payload.tenant_id && (payload.customer_id || payload.employee_id)) {
    setWechatIdentityCheckCache(
      buildWechatIdentityCheckCacheKey("business", payload),
      payload,
    );
  }
}
