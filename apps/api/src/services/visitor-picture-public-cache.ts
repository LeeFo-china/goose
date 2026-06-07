export type PublicCacheTimingValue = number | string | boolean | null;
export type PublicCacheTiming = Record<string, PublicCacheTimingValue>;
export type PublicCacheStatus = "hit" | "miss" | "stale" | "shared";

export type PublicCacheResult<TValue> = {
  value: TValue;
  cache: PublicCacheStatus;
  refreshInFlight?: boolean;
  sharedKey?: string;
  sharedWaitMs?: number;
  sourceQueryMs?: number;
  sourceStartedAt?: string;
  staleAgeMs?: number;
};

export type PublicCacheLoader<TValue> = (
  timing: PublicCacheTiming | null,
) => Promise<TValue>;

type PublicCacheEntry<TValue> = {
  expiresAt: number;
  value: TValue;
};

type PublicInFlightEntry<TValue> = {
  key: string;
  promise: Promise<TValue>;
  sourceStartedAt: number;
  sourceTiming: PublicCacheTiming | null;
};

export class PublicCacheStore {
  private cache = new Map<string, PublicCacheEntry<unknown>>();
  private inFlight = new Map<string, PublicInFlightEntry<unknown>>();
  private generation = 0;

  constructor(private readonly ttlMs: number) {}

  clear() {
    this.generation += 1;
    this.cache.clear();
    this.inFlight.clear();
  }

  async get<TValue>(
    key: string,
    loader: PublicCacheLoader<TValue>,
  ) {
    return (await this.getResult(key, loader)).value;
  }

  async getResult<TValue>(
    key: string,
    loader: PublicCacheLoader<TValue>,
    timing: PublicCacheTiming | null = null,
  ): Promise<PublicCacheResult<TValue>> {
    const now = Date.now();
    const cached = this.cache.get(key) as PublicCacheEntry<TValue> | undefined;
    if (cached && cached.expiresAt > now) return { value: cached.value, cache: "hit" };

    const existing = this.inFlight.get(key) as PublicInFlightEntry<TValue> | undefined;
    if (cached) {
      const refreshEntry = existing ?? this.startRefresh(key, loader, null);
      return {
        value: cached.value,
        cache: "stale",
        refreshInFlight: Boolean(refreshEntry),
        staleAgeMs: Math.max(0, now - cached.expiresAt),
      };
    }

    if (existing) {
      const waitStartedAt = Date.now();
      const value = await existing.promise;
      return {
        value,
        cache: "shared",
        sharedKey: existing.key,
        sharedWaitMs: Date.now() - waitStartedAt,
        sourceQueryMs: getTimingNumber(existing.sourceTiming, "query_ms"),
        sourceStartedAt: new Date(existing.sourceStartedAt).toISOString(),
      };
    }

    const entry = this.startRefresh(key, loader, timing);
    try {
      return { value: await entry.promise, cache: "miss" };
    } catch (error) {
      this.cache.delete(key);
      throw error;
    }
  }

  private startRefresh<TValue>(
    key: string,
    loader: PublicCacheLoader<TValue>,
    timing: PublicCacheTiming | null,
  ): PublicInFlightEntry<TValue> {
    const existing = this.inFlight.get(key) as PublicInFlightEntry<TValue> | undefined;
    if (existing) return existing;

    const sourceStartedAt = Date.now();
    const generation = this.generation;
    const promise = loader(timing)
      .then((value) => {
        if (this.generation === generation) {
          this.cache.set(key, {
            value,
            expiresAt: Date.now() + this.ttlMs,
          });
        }
        return value;
      })
      .finally(() => {
        const current = this.inFlight.get(key);
        if (current?.promise === promise) this.inFlight.delete(key);
      });

    const entry: PublicInFlightEntry<TValue> = {
      key,
      promise,
      sourceStartedAt,
      sourceTiming: timing,
    };
    this.inFlight.set(key, entry as PublicInFlightEntry<unknown>);
    return entry;
  }
}

export function applyPublicCacheTiming<TValue>(
  timing: PublicCacheTiming | null,
  cacheResult: PublicCacheResult<TValue>,
) {
  if (!timing) return;
  timing.cache = cacheResult.cache;
  if (cacheResult.refreshInFlight !== undefined) {
    timing.refresh_in_flight = cacheResult.refreshInFlight;
  }
  if (cacheResult.staleAgeMs !== undefined) timing.stale_age_ms = cacheResult.staleAgeMs;
  if (cacheResult.sharedWaitMs !== undefined) timing.shared_wait_ms = cacheResult.sharedWaitMs;
  if (cacheResult.sharedKey) timing.shared_key = cacheResult.sharedKey;
  if (cacheResult.sourceQueryMs !== undefined) timing.source_query_ms = cacheResult.sourceQueryMs;
  if (cacheResult.sourceStartedAt) timing.source_started_at = cacheResult.sourceStartedAt;
}

function getTimingNumber(timing: PublicCacheTiming | null, key: string) {
  const value = timing?.[key];
  return typeof value === "number" ? value : undefined;
}
