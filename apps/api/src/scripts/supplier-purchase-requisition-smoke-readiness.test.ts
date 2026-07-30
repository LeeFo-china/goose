import { describe, expect, test } from "bun:test";

import {
  type TimeoutScheduler,
  waitForFirstSubmission,
  waitForSavedBackendPid,
} from "./supplier-purchase-requisition-smoke-budget-lock";

function recordingScheduler() {
  let nextToken = 1;
  const callbacks = new Map<unknown, () => void>();
  const cleared: unknown[] = [];
  const scheduled: number[] = [];
  const scheduler: TimeoutScheduler = {
    set(callback, milliseconds) {
      const token = nextToken;
      nextToken += 1;
      callbacks.set(token, callback);
      scheduled.push(milliseconds);
      return token;
    },
    clear(token) {
      callbacks.delete(token);
      cleared.push(token);
    },
  };
  return { scheduler, callbacks, cleared, scheduled };
}

describe("supplier purchase requisition smoke readiness", () => {
  test("bounds setup signals and preserves early operation outcomes", async () => {
    const neverSettles = new Promise<never>(() => {});
    const firstTimers = recordingScheduler();
    await expect(waitForFirstSubmission(
      Promise.resolve(),
      neverSettles,
      undefined,
      firstTimers.scheduler,
    )).resolves.toBe("submitted");
    expect(firstTimers.scheduled).toEqual([15_000]);
    expect(firstTimers.callbacks.size).toBe(0);
    expect(firstTimers.cleared).toHaveLength(1);

    const savedTimers = recordingScheduler();
    await expect(waitForSavedBackendPid(
      Promise.resolve(90210),
      neverSettles,
      1_234,
      savedTimers.scheduler,
    )).resolves.toBe(90210);
    expect(savedTimers.scheduled).toEqual([1_234]);
    expect(savedTimers.callbacks.size).toBe(0);
    expect(savedTimers.cleared).toHaveLength(1);

    const settledTimers = recordingScheduler();
    await expect(waitForFirstSubmission(
      neverSettles,
      Promise.resolve("settled"),
      undefined,
      settledTimers.scheduler,
    )).resolves.toBe("settled");
    expect(settledTimers.scheduled).toEqual([15_000]);
    expect(settledTimers.cleared).toHaveLength(1);

    const failedTimers = recordingScheduler();
    await expect(waitForSavedBackendPid(
      neverSettles,
      Promise.resolve("settled"),
      undefined,
      failedTimers.scheduler,
    )).rejects.toThrow("settled before PID capture");
    expect(failedTimers.scheduled).toEqual([15_000]);
    expect(failedTimers.cleared).toHaveLength(1);
  });
});
