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

const douyinStorage: BudgetLeadContextStorage = {
  read: () => tt.getStorageSync(BUDGET_LEAD_CONTEXT_STORAGE_KEY) as unknown,
  write: (value) => tt.setStorageSync(BUDGET_LEAD_CONTEXT_STORAGE_KEY, value),
  remove: () => tt.removeStorageSync(BUDGET_LEAD_CONTEXT_STORAGE_KEY),
};

export function writeBudgetLeadContext(
  input: BudgetLeadContextInput,
  storage: BudgetLeadContextStorage = douyinStorage,
): void {
  const context = parseBudgetLeadContext({ version: 1, ...input });
  if (!context) throw new TypeError("INVALID_BUDGET_LEAD_CONTEXT");
  storage.write(context);
}

export function readBudgetLeadContext(
  storage: BudgetLeadContextStorage = douyinStorage,
  now = Date.now(),
): BudgetLeadContext | null {
  const context = parseBudgetLeadContext(storage.read());
  if (!context || now < context.storedAt || now - context.storedAt > TRANSIENT_TTL_MS) {
    storage.remove();
    return null;
  }
  return context;
}

export function clearBudgetLeadContext(
  storage: BudgetLeadContextStorage = douyinStorage,
): void {
  storage.remove();
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
