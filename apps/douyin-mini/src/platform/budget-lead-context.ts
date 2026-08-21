export const BUDGET_LEAD_CONTEXT_STORAGE_KEY = "gooes_douyin_budget_lead_context_v1";
const TRANSIENT_TTL_MS = 30 * 60 * 1_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ESTIMATE_NO_PATTERN = /^DYYS-\d{8}-\d{6}$/;

export type BudgetLeadContext = {
  version: 1;
  estimateId: string;
  estimateNo: string;
  displayRange: string;
  storedAt: number;
};

export type BudgetLeadContextInput = Omit<BudgetLeadContext, "version">;

export interface BudgetLeadContextStorage {
  read(): unknown;
  write(value: unknown): void;
  remove(): void;
}

export interface BudgetLeadContextScheduler {
  now(): number;
  schedule(callback: () => void, delayMs: number): () => void;
}

const douyinStorage: BudgetLeadContextStorage = {
  read: () => tt.getStorageSync(BUDGET_LEAD_CONTEXT_STORAGE_KEY) as unknown,
  write: (value) => tt.setStorageSync(BUDGET_LEAD_CONTEXT_STORAGE_KEY, value),
  remove: () => tt.removeStorageSync(BUDGET_LEAD_CONTEXT_STORAGE_KEY),
};

const defaultScheduler: BudgetLeadContextScheduler = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};

let scheduledExpiry: {
  storage: BudgetLeadContextStorage;
  cancel: () => void;
} | null = null;

export function writeBudgetLeadContext(
  input: BudgetLeadContextInput,
  storage: BudgetLeadContextStorage = douyinStorage,
  scheduler?: BudgetLeadContextScheduler,
): boolean {
  const context = parseBudgetLeadContext({ version: 1, ...input });
  if (!context) return false;
  try {
    storage.write(context);
  } catch {
    return false;
  }
  scheduleExpiry(context, storage, schedulerFor(storage, scheduler));
  return true;
}

export function readBudgetLeadContext(
  storage: BudgetLeadContextStorage = douyinStorage,
  now = Date.now(),
  scheduler?: BudgetLeadContextScheduler,
): BudgetLeadContext | null {
  let value: unknown;
  try {
    value = storage.read();
  } catch {
    safeRemove(storage);
    return null;
  }
  const context = parseBudgetLeadContext(value);
  if (!context || now < context.storedAt || now - context.storedAt > TRANSIENT_TTL_MS) {
    cancelExpiry(storage);
    safeRemove(storage);
    return null;
  }
  scheduleExpiry(context, storage, schedulerFor(storage, scheduler));
  return context;
}

export function clearBudgetLeadContext(
  storage: BudgetLeadContextStorage = douyinStorage,
): void {
  cancelExpiry(storage);
  safeRemove(storage);
}

function schedulerFor(
  storage: BudgetLeadContextStorage,
  scheduler?: BudgetLeadContextScheduler,
): BudgetLeadContextScheduler | null {
  return scheduler ?? (storage === douyinStorage ? defaultScheduler : null);
}

function scheduleExpiry(
  context: BudgetLeadContext,
  storage: BudgetLeadContextStorage,
  scheduler: BudgetLeadContextScheduler | null,
) {
  if (!scheduler) return;
  cancelScheduledExpiry();
  const delayMs = context.storedAt + TRANSIENT_TTL_MS - scheduler.now();
  if (delayMs <= 0) {
    safeRemove(storage);
    return;
  }
  let cancel = () => {};
  cancel = scheduler.schedule(() => {
    if (scheduledExpiry?.cancel === cancel) scheduledExpiry = null;
    let current: BudgetLeadContext | null = null;
    try {
      current = parseBudgetLeadContext(storage.read());
    } catch {
      return;
    }
    if (current?.estimateId === context.estimateId && current.storedAt === context.storedAt
      && scheduler.now() - current.storedAt > TRANSIENT_TTL_MS) safeRemove(storage);
  }, delayMs + 1);
  scheduledExpiry = { storage, cancel };
}

function cancelExpiry(storage: BudgetLeadContextStorage) {
  if (scheduledExpiry?.storage !== storage) return;
  cancelScheduledExpiry();
}

function cancelScheduledExpiry() {
  scheduledExpiry?.cancel();
  scheduledExpiry = null;
}

function safeRemove(storage: BudgetLeadContextStorage) {
  try {
    storage.remove();
  } catch {
    // Synchronous storage failures are intentionally contained at this transient boundary.
  }
}

function parseBudgetLeadContext(value: unknown): BudgetLeadContext | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "version", "estimateId", "estimateNo", "displayRange", "storedAt",
  ]) || value.version !== 1 || typeof value.estimateId !== "string"
    || !UUID_PATTERN.test(value.estimateId) || typeof value.estimateNo !== "string"
    || !ESTIMATE_NO_PATTERN.test(value.estimateNo) || typeof value.displayRange !== "string"
    || value.displayRange.length < 1 || value.displayRange.length > 80
    || typeof value.storedAt !== "number" || !Number.isSafeInteger(value.storedAt)
    || value.storedAt < 0) return null;
  return {
    version: 1,
    estimateId: value.estimateId,
    estimateNo: value.estimateNo,
    displayRange: value.displayRange,
    storedAt: value.storedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}
