import { describe, expect, test } from "bun:test";

import {
  ApplymentDraftSaveCancelledError,
  ApplymentDraftSaveQueue,
} from "./finance-wechat-pay-applyment-autosave";

describe("ApplymentDraftSaveQueue", () => {
  test("serializes saves and keeps only the latest waiting payload", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const saved: string[] = [];
    const queue = new ApplymentDraftSaveQueue(async (payload) => {
      saved.push(String(payload.version));
      if (payload.version === 1) await firstGate;
    });

    const first = queue.enqueue({ version: 1 });
    const second = queue.enqueue({ version: 2 });
    const third = queue.enqueue({ version: 3 });
    releaseFirst?.();
    await Promise.all([first, second, third]);
    await queue.flush();

    expect(saved).toEqual(["1", "3"]);
  });

  test("continues with a waiting save after the active save fails", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const saved: string[] = [];
    const queue = new ApplymentDraftSaveQueue(async (payload) => {
      saved.push(String(payload.version));
      if (payload.version === 1) {
        await firstGate;
        throw new Error("network");
      }
    });

    const first = queue.enqueue({ version: 1 });
    const second = queue.enqueue({ version: 2 });
    releaseFirst?.();

    await expect(first).rejects.toThrow("network");
    await second;
    await queue.flush();
    expect(saved).toEqual(["1", "2"]);
  });

  test("continues after a failed save", async () => {
    let attempt = 0;
    const queue = new ApplymentDraftSaveQueue(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("network");
    });

    await expect(queue.enqueue({ version: 1 })).rejects.toThrow("network");
    await queue.enqueue({ version: 2 });
    await queue.flush();
    expect(attempt).toBe(2);
  });

  test("flush waits for a drain scheduled while the previous drain settles", async () => {
    const saved: string[] = [];
    const queue = new ApplymentDraftSaveQueue(async (payload) => {
      saved.push(String(payload.version));
      await Promise.resolve();
    });

    await queue.enqueue({ version: 1 });
    const second = queue.enqueue({ version: 2 });
    await queue.flush();
    await second;

    expect(saved).toEqual(["1", "2"]);
  });

  test("reset invalidates old responses without blocking the new draft", async () => {
    let releaseOld: (() => void) | undefined;
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const committed: string[] = [];
    const queue = new ApplymentDraftSaveQueue(async (payload, context) => {
      if (payload.id === "old") await oldGate;
      if (context.isCurrent()) committed.push(String(payload.id));
    });

    const oldSave = queue.enqueue({ id: "old" });
    queue.reset();
    const newSave = queue.enqueue({ id: "new" });
    releaseOld?.();

    await expect(oldSave).rejects.toBeInstanceOf(
      ApplymentDraftSaveCancelledError,
    );
    await newSave;
    await queue.flush();
    expect(committed).toEqual(["new"]);
  });

  test("dispose rejects new saves and invalidates an in-flight response", async () => {
    let releaseSave: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let committed = false;
    const queue = new ApplymentDraftSaveQueue(async (_payload, context) => {
      await gate;
      if (context.isCurrent()) committed = true;
    });

    const inFlight = queue.enqueue({ version: 1 });
    queue.dispose();
    releaseSave?.();

    await expect(inFlight).rejects.toBeInstanceOf(
      ApplymentDraftSaveCancelledError,
    );
    await expect(queue.enqueue({ version: 2 })).rejects.toBeInstanceOf(
      ApplymentDraftSaveCancelledError,
    );
    expect(committed).toBe(false);
  });
});
