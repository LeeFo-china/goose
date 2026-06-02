import type { AuthContext } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;

export class AuthContextCache {
  private authUserCache = new Map<string, {
    expiresAt: number;
    value: AuthContext;
  }>();
  private employeeCache = new Map<string, {
    expiresAt: number;
    value: AuthContext;
  }>();
  private authUserInFlight = new Map<string, Promise<AuthContext>>();
  private employeeInFlight = new Map<string, Promise<AuthContext>>();

  getCacheValue(
    cache: Map<string, { expiresAt: number; value: AuthContext }>,
    key: string,
  ) {
    const item = cache.get(key);
    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }

    return item.value;
  }

  getByAuthUserId(authUserId: string) {
    return this.getCacheValue(this.authUserCache, authUserId);
  }

  getByEmployeeId(employeeId: string) {
    return this.getCacheValue(this.employeeCache, employeeId);
  }

  setCacheValue(key: string, value: AuthContext) {
    const expiresAt = Date.now() + CACHE_TTL_MS;
    this.authUserCache.set(key, { expiresAt, value });

    if (value.employeeId) {
      this.employeeCache.set(value.employeeId, { expiresAt, value });
    }
  }

  setCacheContext(value: AuthContext) {
    if (value.authUserId) {
      this.setCacheValue(value.authUserId, value);
      return;
    }

    if (value.employeeId) {
      this.employeeCache.set(value.employeeId, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value,
      });
    }
  }

  getAuthUserInFlight(authUserId: string) {
    return this.authUserInFlight.get(authUserId);
  }

  getEmployeeInFlight(employeeId: string) {
    return this.employeeInFlight.get(employeeId);
  }

  setAuthUserInFlight(authUserId: string, promise: Promise<AuthContext>) {
    this.authUserInFlight.set(authUserId, promise);
    void promise.then(() => {
      if (this.authUserInFlight.get(authUserId) === promise) {
        this.authUserInFlight.delete(authUserId);
      }
    }, () => {
      if (this.authUserInFlight.get(authUserId) === promise) {
        this.authUserInFlight.delete(authUserId);
      }
    });
  }

  setEmployeeInFlight(employeeId: string, promise: Promise<AuthContext>) {
    this.employeeInFlight.set(employeeId, promise);
    void promise.then(() => {
      if (this.employeeInFlight.get(employeeId) === promise) {
        this.employeeInFlight.delete(employeeId);
      }
    }, () => {
      if (this.employeeInFlight.get(employeeId) === promise) {
        this.employeeInFlight.delete(employeeId);
      }
    });
  }

  invalidateAuthContext(input: {
    authUserId?: string | null;
    employeeId?: string | null;
  }) {
    if (input.authUserId) {
      this.authUserCache.delete(input.authUserId);
      this.authUserInFlight.delete(input.authUserId);
    }

    if (input.employeeId) {
      this.employeeCache.delete(input.employeeId);
      this.employeeInFlight.delete(input.employeeId);
    }
  }

  invalidateTenantContext(tenantId: string | null | undefined) {
    if (!tenantId) return;

    for (const [key, item] of this.authUserCache.entries()) {
      if (item.value.tenantId === tenantId) {
        this.authUserCache.delete(key);
      }
    }

    for (const [key, item] of this.employeeCache.entries()) {
      if (item.value.tenantId === tenantId) {
        this.employeeCache.delete(key);
      }
    }
  }
}
