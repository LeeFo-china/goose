import type { SupplierPayable, SupplierPayableFacts } from "./payable-types";

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})\.\d{2}$/;
const ZERO_MINOR = BigInt(0);

export function availableToRequestAmount(
  payable: Pick<SupplierPayableFacts, "open_amount" | "reserved_amount">,
): string {
  const open = moneyToMinor(payable.open_amount);
  const reserved = moneyToMinor(payable.reserved_amount);
  return minorToMoney(open > reserved ? open - reserved : ZERO_MINOR);
}

export function canSelectPayable(
  payable: Pick<SupplierPayable, "available_to_request_amount">,
): boolean {
  return moneyToMinor(payable.available_to_request_amount) > ZERO_MINOR;
}

export function canMergePayables(
  selected: Pick<
    SupplierPayable,
    "project_id" | "tenant_supplier_id" | "currency"
  >,
  candidate: Pick<
    SupplierPayable,
    "project_id" | "tenant_supplier_id" | "currency"
  >,
): boolean {
  return selected.project_id === candidate.project_id &&
    selected.tenant_supplier_id === candidate.tenant_supplier_id &&
    selected.currency === candidate.currency;
}

export function isPayableOverdue(
  payable: Pick<SupplierPayable, "due_at" | "open_amount">,
  now = new Date(),
): boolean {
  const dueAt = Date.parse(payable.due_at);
  return Number.isFinite(dueAt) &&
    dueAt < now.getTime() &&
    moneyToMinor(payable.open_amount) > ZERO_MINOR;
}

function moneyToMinor(value: string): bigint {
  if (!MONEY_PATTERN.test(value)) return ZERO_MINOR;
  return BigInt(value.replace(".", ""));
}

function minorToMoney(value: bigint): string {
  const safe = value > ZERO_MINOR ? value : ZERO_MINOR;
  const digits = safe.toString().padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
