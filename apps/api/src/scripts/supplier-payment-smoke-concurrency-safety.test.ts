import { describe, expect, test } from "bun:test";

import {
  createConcurrencyRunIdentity,
  pollUntilBeforeDeadline,
  prepareConcurrencyRun,
  runConcurrentSubmitOverlap,
} from "./supplier-payment-smoke-concurrency";

describe("supplier payment committed concurrency safety", () => {
  test("creates different request and idempotency UUIDs for every run", () => {
    let sequence = 1;
    const idFactory = () =>
      `87000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;

    const first = createConcurrencyRunIdentity(idFactory);
    const second = createConcurrencyRunIdentity(idFactory);

    expect(new Set(Object.values(first)).size).toBe(7);
    expect(new Set([
      ...Object.values(first),
      ...Object.values(second),
    ]).size).toBe(14);
  });

  test("does no write or delete when generated IDs already exist", async () => {
    const calls: string[] = [];
    let sequence = 1;
    const identity = createConcurrencyRunIdentity(() =>
      `87000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`
    );

    await expect(prepareConcurrencyRun({
      identity,
      async countConflicts() {
        calls.push("select");
        return 1;
      },
      async seed() {
        calls.push("seed");
      },
    })).rejects.toThrow("GENERATED_IDS_CONFLICT");
    expect(calls).toEqual(["select"]);
    expect(calls).not.toContain("delete");
  });

  test("polls until a real observed condition instead of assuming timing", async () => {
    let clock = 0;
    let probes = 0;
    await pollUntilBeforeDeadline({
      label: "LOCK",
      deadlineAt: 20,
      now: () => clock,
      async delay(milliseconds) {
        clock += milliseconds;
      },
      async probe() {
        probes += 1;
        return probes === 3;
      },
    });
    expect(probes).toBe(3);
  });

  test("fails bounded waits and releases client A", async () => {
    let releasedA = false;
    const never = new Promise<string>(() => {});
    const client = (clientId: "A" | "B") => ({
      clientId,
      async begin<Result>(
        callback: (transaction: { clientId: "A" | "B" }) => Promise<Result>,
      ) {
        const result = await callback({ clientId });
        if (clientId === "A") releasedA = true;
        return result;
      },
    });

    await expect(runConcurrentSubmitOverlap({
      clients: [client("A"), client("B")],
      timeoutMs: 20,
      async submit(clientId) {
        return clientId === "A" ? "submitted" : never;
      },
      async waitForSecondBlocked() {},
    })).rejects.toThrow("DEADLINE");
    expect(releasedA).toBe(true);
  });

  test("times out a lock observation that never appears", async () => {
    let clock = 0;
    let probes = 0;
    await expect(pollUntilBeforeDeadline({
      label: "SECOND_SUBMIT_LOCK",
      deadlineAt: 10,
      now: () => clock,
      async delay(milliseconds) {
        clock += milliseconds;
      },
      async probe() {
        probes += 1;
        return false;
      },
    })).rejects.toThrow("SECOND_SUBMIT_LOCK_DEADLINE");
    expect(probes).toBeGreaterThan(1);
  });
});
