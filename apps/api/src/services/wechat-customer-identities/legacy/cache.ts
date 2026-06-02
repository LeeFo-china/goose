import {
  CUSTOMER_TENANT_OPTIONS_CACHE_TTL_MS,
  LOGIN_STATE_BY_OPENID_CACHE_TTL_MS,
  LOGIN_STATE_BY_OPENID_MISS_CACHE_TTL_MS,
  MAX_CUSTOMER_TENANT_OPTIONS_CACHE_SIZE,
  type WechatCustomerIdentityCacheContext,
  type WechatCustomerTenantOption,
  type WechatLoginMembershipState,
  type WechatLoginStateByOpenid,
} from "./shared";

export function customerTenantOptionsCacheKey(input: {
  authUserId: string;
  includeProjectSummary?: boolean;
}) {
  return [
    input.includeProjectSummary ? "summary" : "lean",
    input.authUserId,
  ].join(":");
}

function pruneOrClearExpiredCache<T>(
  cache: Map<string, { expiresAt: number; value: T }>,
  now: number,
) {
  if (cache.size < MAX_CUSTOMER_TENANT_OPTIONS_CACHE_SIZE) {
    return;
  }

  for (const [key, item] of cache.entries()) {
    if (item.expiresAt <= now) {
      cache.delete(key);
    }
  }

  if (cache.size >= MAX_CUSTOMER_TENANT_OPTIONS_CACHE_SIZE) {
    cache.clear();
  }
}

export function getCachedCustomerTenantOptions(
  context: WechatCustomerIdentityCacheContext,
  cacheKey: string,
) {
  const cached = context.customerTenantOptionsCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    context.customerTenantOptionsCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

export function setCachedCustomerTenantOptions(
  context: WechatCustomerIdentityCacheContext,
  cacheKey: string,
  value: WechatCustomerTenantOption[],
) {
  const now = Date.now();
  pruneOrClearExpiredCache(context.customerTenantOptionsCache, now);
  context.customerTenantOptionsCache.set(cacheKey, {
    expiresAt: now + CUSTOMER_TENANT_OPTIONS_CACHE_TTL_MS,
    value,
  });
}

export function getCachedLoginMembershipState(
  context: WechatCustomerIdentityCacheContext,
  authUserId: string,
) {
  const cached = context.loginMembershipStateCache.get(authUserId);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    context.loginMembershipStateCache.delete(authUserId);
    return null;
  }

  return cached.value;
}

export function setCachedLoginMembershipState(
  context: WechatCustomerIdentityCacheContext,
  authUserId: string,
  value: WechatLoginMembershipState,
) {
  const now = Date.now();
  pruneOrClearExpiredCache(context.loginMembershipStateCache, now);
  context.loginMembershipStateCache.set(authUserId, {
    expiresAt: now + CUSTOMER_TENANT_OPTIONS_CACHE_TTL_MS,
    value,
  });
}

export function getCachedLoginStateByOpenid(
  context: WechatCustomerIdentityCacheContext,
  openid: string,
) {
  const cached = context.loginStateByOpenidCache.get(openid);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    context.loginStateByOpenidCache.delete(openid);
    return undefined;
  }

  return cached.value;
}

export function setCachedLoginStateByOpenid(
  context: WechatCustomerIdentityCacheContext,
  openid: string,
  value: WechatLoginStateByOpenid | null,
) {
  const now = Date.now();
  pruneOrClearExpiredCache(context.loginStateByOpenidCache, now);
  context.loginStateByOpenidCache.set(openid, {
    expiresAt: now + (
      value ? LOGIN_STATE_BY_OPENID_CACHE_TTL_MS : LOGIN_STATE_BY_OPENID_MISS_CACHE_TTL_MS
    ),
    value,
  });
}

export function invalidateWechatLoginState(
  this: WechatCustomerIdentityCacheContext,
  input: {
    authUserId?: string | null;
    openid?: string | null;
  },
) {
  if (input.openid) {
    this.loginStateByOpenidCache.delete(input.openid);
    this.loginStateByOpenidInFlight.delete(input.openid);
  }

  if (!input.authUserId) {
    return;
  }

  for (const [openid, item] of this.loginStateByOpenidCache.entries()) {
    if (item.value?.authUserId === input.authUserId) {
      this.loginStateByOpenidCache.delete(openid);
      this.loginStateByOpenidInFlight.delete(openid);
    }
  }
}

export function invalidateCustomerTenantOptions(
  this: WechatCustomerIdentityCacheContext,
  authUserId?: string | null,
) {
  if (!authUserId) {
    return;
  }

  this.loginMembershipStateCache.delete(authUserId);
  this.loginMembershipStateInFlight.delete(authUserId);
  invalidateWechatLoginState.call(this, { authUserId });

  for (const key of this.customerTenantOptionsCache.keys()) {
    if (key.endsWith(`:${authUserId}`)) {
      this.customerTenantOptionsCache.delete(key);
      this.customerTenantOptionsInFlight.delete(key);
    }
  }
}
