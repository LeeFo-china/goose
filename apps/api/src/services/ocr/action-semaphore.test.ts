import { describe, expect, test } from "bun:test";

import { OcrActionSemaphore } from "./action-semaphore";

describe("OcrActionSemaphore", () => {
  test("does not exceed the configured action concurrency", async () => {
    const semaphore = new OcrActionSemaphore();
    let active = 0;
    let maximum = 0;
    const release: Array<() => void> = [];
    const operations = Array.from({ length: 4 }, () =>
      semaphore.run("BizLicenseOCR", 2, async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => release.push(resolve));
        active -= 1;
      }));

    await waitUntil(() => release.length === 2);
    expect(maximum).toBe(2);
    release.splice(0).forEach((resolve) => resolve());
    await waitUntil(() => release.length === 2);
    release.splice(0).forEach((resolve) => resolve());
    await Promise.all(operations);

    expect(maximum).toBe(2);
  });
});

async function waitUntil(predicate: () => boolean) {
  for (let attempts = 0; attempts < 50; attempts += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("semaphore test timed out");
}
