type FulfilledEntry<Value> = {
  expiresAt: number;
  value: Value;
};

type GetOrCreateOptions<Value> = {
  shouldCache?: (value: Value) => boolean;
};

export class ExpiringInFlightCache<Key, Value> {
  private readonly fulfilled = new Map<Key, FulfilledEntry<Value>>();
  private readonly inFlight = new Map<Key, Promise<Value>>();
  private readonly ttlMs: number;

  constructor(options: { ttlMs: number }) {
    this.ttlMs = options.ttlMs;
  }

  getOrCreate(
    key: Key,
    loader: () => Promise<Value>,
    options: GetOrCreateOptions<Value> = {},
  ): Promise<Value> {
    const cached = this.fulfilled.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.value);
    }
    if (cached) this.fulfilled.delete(key);

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = Promise.resolve()
      .then(loader)
      .then((value) => {
        if (
          this.inFlight.get(key) === request &&
          (options.shouldCache?.(value) ?? true)
        ) {
          this.fulfilled.set(key, {
            expiresAt: Date.now() + this.ttlMs,
            value,
          });
        }
        return value;
      })
      .finally(() => {
        if (this.inFlight.get(key) === request) {
          this.inFlight.delete(key);
        }
      });
    this.inFlight.set(key, request);
    return request;
  }

  invalidate(key: Key): void {
    this.fulfilled.delete(key);
    this.inFlight.delete(key);
  }

  clear(): void {
    this.fulfilled.clear();
    this.inFlight.clear();
  }
}
