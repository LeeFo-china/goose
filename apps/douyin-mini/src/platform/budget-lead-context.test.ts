import { describe, expect, test } from "bun:test";

import {
  BUDGET_LEAD_CONTEXT_STORAGE_KEY,
  clearBudgetLeadContext,
  readBudgetLeadContext,
  writeBudgetLeadContext,
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

describe("budget lead transient context", () => {
  test("writes only the versioned public handoff fields", () => {
    const memory = memoryStorage();
    writeBudgetLeadContext({
      estimateId: "22222222-2222-4222-8222-222222222222",
      estimateNo: "DYYS-20260820-000001",
      displayRange: "¥110,000 - ¥140,000",
      storedAt: 1_775_000_000_000,
    }, memory.storage);

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
});
