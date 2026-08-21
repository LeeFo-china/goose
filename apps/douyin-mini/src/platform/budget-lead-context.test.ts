import { describe, expect, test } from "bun:test";

import {
  BUDGET_LEAD_CONTEXT_STORAGE_KEY,
  clearBudgetLeadContext,
  readBudgetLeadContext,
  writeBudgetLeadContext,
  type BudgetLeadContextScheduler,
  type BudgetLeadContextStorage,
} from "./budget-lead-context";

function memoryStorage(initial?: unknown) {
  let value = initial;
  const removed: string[] = [];
  const storage: BudgetLeadContextStorage = {
    read: () => value,
    write: (next) => { value = next; },
    remove: () => { removed.push(BUDGET_LEAD_CONTEXT_STORAGE_KEY); value = undefined; },
  };
  return { storage, readRaw: () => value, removed };
}

function schedulerHarness(initialNow: number) {
  let now = initialNow;
  const timers: Array<{ at: number; active: boolean; callback: () => void }> = [];
  const scheduler: BudgetLeadContextScheduler = {
    now: () => now,
    schedule(callback, delayMs) {
      const timer = { at: now + delayMs, active: true, callback };
      timers.push(timer);
      return () => { timer.active = false; };
    },
  };
  return {
    scheduler,
    advance(milliseconds: number) {
      now += milliseconds;
      for (const timer of timers) {
        if (timer.active && timer.at <= now) {
          timer.active = false;
          timer.callback();
        }
      }
    },
    activeTimers: () => timers.filter((timer) => timer.active).length,
  };
}

describe("budget lead transient context", () => {
  test("writes only the versioned public handoff fields", () => {
    const memory = memoryStorage();
    expect(writeBudgetLeadContext({
      estimateId: "22222222-2222-4222-8222-222222222222",
      estimateNo: "DYYS-20260820-000001",
      displayRange: "¥110,000 - ¥140,000",
      storedAt: 1_775_000_000_000,
    }, memory.storage)).toBe(true);

    expect(memory.readRaw()).toEqual({
      version: 1,
      estimateId: "22222222-2222-4222-8222-222222222222",
      estimateNo: "DYYS-20260820-000001",
      displayRange: "¥110,000 - ¥140,000",
      storedAt: 1_775_000_000_000,
    });
    expect(JSON.stringify(memory.readRaw())).not.toMatch(/tenant|subject|ip|pricing/i);
  });

  test("reads a current strict snapshot and clears expired or malformed values", () => {
    const current = {
      version: 1,
      estimateId: "22222222-2222-4222-8222-222222222222",
      estimateNo: "DYYS-20260820-000001",
      displayRange: "¥110,000 - ¥140,000",
      storedAt: 1_775_000_000_000,
    } as const;
    expect(readBudgetLeadContext(memoryStorage(current).storage, current.storedAt + 60_000))
      .toEqual(current);

    for (const invalid of [
      { ...current, version: 2 },
      { ...current, tenantId: "must-not-exist" },
      { ...current, estimateId: "bad-id" },
      { ...current, estimateNo: current.estimateId },
      { ...current, displayRange: "x".repeat(81) },
      { ...current, storedAt: Number.NaN },
    ]) {
      const memory = memoryStorage(invalid);
      expect(readBudgetLeadContext(memory.storage, current.storedAt + 60_000)).toBeNull();
      expect(memory.removed).toEqual([BUDGET_LEAD_CONTEXT_STORAGE_KEY]);
    }

    const expired = memoryStorage(current);
    expect(readBudgetLeadContext(expired.storage, current.storedAt + 31 * 60_000))
      .toBeNull();
    expect(expired.removed).toEqual([BUDGET_LEAD_CONTEXT_STORAGE_KEY]);
  });

  test("clears the dedicated key without touching lead storage", () => {
    const memory = memoryStorage({ version: 1 });
    clearBudgetLeadContext(memory.storage);
    expect(BUDGET_LEAD_CONTEXT_STORAGE_KEY).toBe("gooes_douyin_budget_lead_context_v1");
    expect(memory.removed).toEqual([BUDGET_LEAD_CONTEXT_STORAGE_KEY]);
  });

  test("contains synchronous storage failures without crashing the page", () => {
    const broken: BudgetLeadContextStorage = {
      read: () => { throw new Error("read failed"); },
      write: () => { throw new Error("write failed"); },
      remove: () => { throw new Error("remove failed"); },
    };
    const input = {
      estimateId: "22222222-2222-4222-8222-222222222222",
      estimateNo: "DYYS-20260820-000001",
      displayRange: "¥110,000 - ¥140,000",
      storedAt: 1_775_000_000_000,
    } as const;

    expect(() => readBudgetLeadContext(broken, input.storedAt)).not.toThrow();
    expect(readBudgetLeadContext(broken, input.storedAt)).toBeNull();
    expect(writeBudgetLeadContext(input, broken)).toBe(false);
    expect(() => clearBudgetLeadContext(broken)).not.toThrow();
  });

  test("keeps one in-process TTL timer and a newer write cancels the old expiry", () => {
    const storedAt = 1_775_000_000_000;
    const fake = schedulerHarness(storedAt);
    const memory = memoryStorage();
    const base = {
      estimateId: "22222222-2222-4222-8222-222222222222",
      estimateNo: "DYYS-20260820-000001",
      displayRange: "¥110,000 - ¥140,000",
    } as const;
    expect(writeBudgetLeadContext(
      { ...base, storedAt },
      memory.storage,
      fake.scheduler,
    )).toBe(true);
    fake.advance(60_000);
    expect(writeBudgetLeadContext(
      { ...base, estimateNo: "DYYS-20260820-000002", storedAt: storedAt + 60_000 },
      memory.storage,
      fake.scheduler,
    )).toBe(true);
    expect(fake.activeTimers()).toBe(1);

    fake.advance(29 * 60_000);
    expect(memory.readRaw()).toMatchObject({ estimateNo: "DYYS-20260820-000002" });
    fake.advance(60_001);
    expect(memory.readRaw()).toBeUndefined();
    expect(fake.activeTimers()).toBe(0);
  });

  test("keeps one expiry timer even when the storage boundary changes", () => {
    const storedAt = 1_775_000_000_000;
    const fake = schedulerHarness(storedAt);
    const first = memoryStorage();
    const second = memoryStorage();
    const input = {
      estimateId: "22222222-2222-4222-8222-222222222222",
      estimateNo: "DYYS-20260820-000001",
      displayRange: "¥110,000 - ¥140,000",
      storedAt,
    } as const;

    expect(writeBudgetLeadContext(input, first.storage, fake.scheduler)).toBe(true);
    expect(writeBudgetLeadContext(input, second.storage, fake.scheduler)).toBe(true);
    expect(fake.activeTimers()).toBe(1);
  });

  test("restart read lazily prunes expiry and schedules cleanup for a current value", () => {
    const storedAt = 1_775_000_000_000;
    const current = {
      version: 1,
      estimateId: "22222222-2222-4222-8222-222222222222",
      estimateNo: "DYYS-20260820-000001",
      displayRange: "¥110,000 - ¥140,000",
      storedAt,
    } as const;
    const fake = schedulerHarness(storedAt + 10 * 60_000);
    const memory = memoryStorage(current);
    expect(readBudgetLeadContext(memory.storage, fake.scheduler.now(), fake.scheduler))
      .toEqual(current);
    expect(fake.activeTimers()).toBe(1);
    fake.advance(20 * 60_000 + 1);
    expect(memory.readRaw()).toBeUndefined();
  });

  test("app launch invokes lazy transient cleanup", async () => {
    const appSource = await Bun.file(`${__dirname}/../app.ts`).text();
    expect(appSource).toContain("readBudgetLeadContext();");
  });
});
