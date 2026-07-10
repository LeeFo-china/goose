import { describe, expect, mock, test } from "bun:test";
import { ExpiringInFlightCache } from "./expiring-in-flight-cache";

describe("ExpiringInFlightCache", () => {
  test("reuses one in-flight loader for the same key", async () => {
    let release: ((value: { id: string }) => void) | undefined;
    const pending = new Promise<{ id: string }>((resolve) => {
      release = resolve;
    });
    const loader = mock(() => pending);
    const cache = new ExpiringInFlightCache<string, { id: string }>({
      ttlMs: 5_000,
    });

    const firstPromise = cache.getOrCreate("project-1", loader);
    const secondPromise = cache.getOrCreate("project-1", loader);
    release?.({ id: "project-1" });
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  test("reuses a fulfilled value until its ttl expires", async () => {
    const loader = mock(async () => ({ id: crypto.randomUUID() }));
    const cache = new ExpiringInFlightCache<string, { id: string }>({
      ttlMs: 5,
    });

    const first = await cache.getOrCreate("project-1", loader);
    const cached = await cache.getOrCreate("project-1", loader);
    await Bun.sleep(10);
    const refreshed = await cache.getOrCreate("project-1", loader);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(cached).toBe(first);
    expect(refreshed).not.toBe(first);
  });

  test("keeps different keys isolated", async () => {
    const loader = mock(async (id: string) => ({ id }));
    const cache = new ExpiringInFlightCache<string, { id: string }>({
      ttlMs: 5_000,
    });

    const first = await cache.getOrCreate("project-1", () => loader("project-1"));
    const second = await cache.getOrCreate("project-2", () => loader("project-2"));

    expect(first.id).toBe("project-1");
    expect(second.id).toBe("project-2");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test("clears a rejected in-flight loader before retrying", async () => {
    const loader = mock(async () => {
      if (loader.mock.calls.length === 1) throw new Error("temporary failure");
      return { id: "project-1" };
    });
    const cache = new ExpiringInFlightCache<string, { id: string }>({
      ttlMs: 5_000,
    });

    await expect(cache.getOrCreate("project-1", loader)).rejects.toThrow(
      "temporary failure",
    );
    const retried = await cache.getOrCreate("project-1", loader);

    expect(retried.id).toBe("project-1");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test("does not cache a value rejected by shouldCache", async () => {
    const loader = mock(async () => ({ source: "unavailable" }));
    const cache = new ExpiringInFlightCache<string, { source: string }>({
      ttlMs: 5_000,
    });

    await cache.getOrCreate("project-1", loader, {
      shouldCache: (value) => value.source !== "unavailable",
    });
    await cache.getOrCreate("project-1", loader, {
      shouldCache: (value) => value.source !== "unavailable",
    });

    expect(loader).toHaveBeenCalledTimes(2);
  });

  test("invalidates one key without clearing another key", async () => {
    const loader = mock(async (id: string) => ({ id, call: loader.mock.calls.length }));
    const cache = new ExpiringInFlightCache<string, { id: string; call: number }>({
      ttlMs: 5_000,
    });

    const first = await cache.getOrCreate("project-1", () => loader("project-1"));
    const second = await cache.getOrCreate("project-2", () => loader("project-2"));
    cache.invalidate("project-1");
    const refreshed = await cache.getOrCreate("project-1", () => loader("project-1"));
    const stillCached = await cache.getOrCreate("project-2", () => loader("project-2"));

    expect(refreshed).not.toBe(first);
    expect(stillCached).toBe(second);
    expect(loader).toHaveBeenCalledTimes(3);
  });

  test("does not cache an in-flight value invalidated before it resolves", async () => {
    let release: ((value: { id: string }) => void) | undefined;
    const loader = mock(() => new Promise<{ id: string }>((resolve) => {
      release = resolve;
    }));
    const cache = new ExpiringInFlightCache<string, { id: string }>({
      ttlMs: 5_000,
    });

    const stalePromise = cache.getOrCreate("project-1", loader);
    await Promise.resolve();
    cache.invalidate("project-1");
    release?.({ id: "stale" });
    await stalePromise;
    const freshPromise = cache.getOrCreate("project-1", loader);
    await Promise.resolve();
    release?.({ id: "fresh" });
    const fresh = await freshPromise;

    expect(fresh.id).toBe("fresh");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test("clears every fulfilled entry", async () => {
    const loader = mock(async (id: string) => ({ id }));
    const cache = new ExpiringInFlightCache<string, { id: string }>({
      ttlMs: 5_000,
    });

    await cache.getOrCreate("project-1", () => loader("project-1"));
    await cache.getOrCreate("project-2", () => loader("project-2"));
    cache.clear();
    await cache.getOrCreate("project-1", () => loader("project-1"));
    await cache.getOrCreate("project-2", () => loader("project-2"));

    expect(loader).toHaveBeenCalledTimes(4);
  });

  test("evicts the least recently used fulfilled entry at capacity", async () => {
    const loader = mock(async (id: string) => ({ id, loaded: crypto.randomUUID() }));
    const cache = new ExpiringInFlightCache<string, { id: string; loaded: string }>({
      ttlMs: 5_000,
      maxEntries: 2,
    });

    const first = await cache.getOrCreate("project-1", () => loader("project-1"));
    await cache.getOrCreate("project-2", () => loader("project-2"));
    await cache.getOrCreate("project-1", () => loader("project-1"));
    await cache.getOrCreate("project-3", () => loader("project-3"));
    const refreshed = await cache.getOrCreate("project-2", () => loader("project-2"));

    expect(refreshed.loaded).not.toBe(first.loaded);
    expect(loader).toHaveBeenCalledTimes(4);
  });

  test("prunes expired one-off entries before capacity eviction", async () => {
    const loader = mock(async (id: string) => ({ id }));
    const cache = new ExpiringInFlightCache<string, { id: string }>({
      ttlMs: 10,
      maxEntries: 2,
    });

    await cache.getOrCreate("expired", () => loader("expired"));
    await Bun.sleep(6);
    const live = await cache.getOrCreate("live", () => loader("live"));
    await Bun.sleep(6);
    await cache.getOrCreate("new", () => loader("new"));
    const stillLive = await cache.getOrCreate("live", () => loader("live"));

    expect(stillLive).toBe(live);
    expect(loader).toHaveBeenCalledTimes(3);
  });
});
