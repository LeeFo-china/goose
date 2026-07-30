import type {
  PurchaseOrderFulfillmentStatus,
} from "./purchase-order-fulfillment-types";
import type { PageData } from "./purchase-order-types";
import type {
  SupplierCommandAttempt,
} from "../supplier-products/supplier-command-attempt";
import {
  ADMIN_SESSION_STORAGE_PREFIX,
  type AdminSessionScope,
} from "../layout/admin-session-scope";

export type DeepReadonly<Value> = Value extends (...args: never[]) => unknown
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export type FrozenCommand<
  Payload,
  Attempt extends SupplierCommandAttempt = SupplierCommandAttempt,
> = Readonly<{
  attempt: DeepReadonly<Attempt>;
  payload: DeepReadonly<Payload>;
  phase: "in_flight" | "uncertain";
  resourcePath: string;
}>;

export type FrozenCommandKind = "confirm" | "shipment" | "receipt";

export type FrozenCommandStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export function getBrowserFrozenCommandStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function beginFrozenCommand<
  Payload,
  Attempt extends SupplierCommandAttempt,
>(
  attempt: Attempt,
  payload: Payload,
  resourcePath: string,
): FrozenCommand<Payload, Attempt> {
  return deepFreeze({
    attempt: structuredClone(attempt),
    payload: structuredClone(payload),
    phase: "in_flight" as const,
    resourcePath,
  });
}

export function markFrozenCommandInFlight<
  Payload,
  Attempt extends SupplierCommandAttempt,
>(
  command: FrozenCommand<Payload, Attempt>,
): FrozenCommand<Payload, Attempt> {
  return Object.freeze({
    ...command,
    phase: "in_flight" as const,
  }) as FrozenCommand<Payload, Attempt>;
}

export function markFrozenCommandUncertain<
  Payload,
  Attempt extends SupplierCommandAttempt,
>(
  command: FrozenCommand<Payload, Attempt>,
): FrozenCommand<Payload, Attempt> {
  return Object.freeze({
    ...command,
    phase: "uncertain" as const,
  }) as FrozenCommand<Payload, Attempt>;
}

export function clearFrozenCommand() {
  return null;
}

export function canAbandonFrozenCommand<
  Payload,
  Attempt extends SupplierCommandAttempt,
>(
  command: FrozenCommand<Payload, Attempt> | null,
): command is FrozenCommand<Payload, Attempt> & { phase: "uncertain" } {
  return command?.phase === "uncertain";
}

export function persistFrozenCommand<
  Payload,
  Attempt extends SupplierCommandAttempt,
>(
  storage: FrozenCommandStorage | null,
  sessionScope: AdminSessionScope | null,
  kind: FrozenCommandKind,
  command: FrozenCommand<Payload, Attempt>,
) {
  if (!storage || !sessionScope) return;
  try {
    storage.setItem(
      frozenCommandStorageKey(
        sessionScope.storageScope,
        command.resourcePath,
        kind,
      ),
      JSON.stringify({
        schemaVersion: 2,
        sessionScope: sessionScope.storageScope,
        kind,
        attempt: command.attempt,
        payload: command.payload,
        phase: command.phase,
        resourcePath: command.resourcePath,
      }),
    );
  } catch {
    return;
  }
}

export function restoreFrozenCommand<
  Payload,
  Attempt extends SupplierCommandAttempt = SupplierCommandAttempt,
>(
  storage: FrozenCommandStorage | null,
  sessionScope: AdminSessionScope | null,
  orderId: string,
  kind: FrozenCommandKind,
): FrozenCommand<Payload, Attempt> | null {
  if (!storage || !sessionScope) return null;
  const key = frozenCommandStorageKey(
    sessionScope.storageScope,
    orderId,
    kind,
  );
  try {
    const serialized = storage.getItem(key);
    if (!serialized) return null;
    const stored = JSON.parse(serialized) as unknown;
    if (!isStoredFrozenCommand(
      stored,
      sessionScope.storageScope,
      orderId,
      kind,
    )) {
      safeRemoveStoredCommand(storage, key);
      return null;
    }
    const command = beginFrozenCommand(
      stored.attempt as Attempt,
      stored.payload as Payload,
      stored.resourcePath,
    );
    return markFrozenCommandUncertain(command);
  } catch {
    safeRemoveStoredCommand(storage, key);
    return null;
  }
}

export function clearPersistedFrozenCommand(
  storage: FrozenCommandStorage | null,
  sessionScope: AdminSessionScope | null,
  orderId: string,
  kind: FrozenCommandKind,
) {
  if (!storage || !sessionScope) return;
  safeRemoveStoredCommand(
    storage,
    frozenCommandStorageKey(sessionScope.storageScope, orderId, kind),
  );
}

export type FulfillmentLoadState = {
  loaded: boolean;
  error: boolean;
  status: PurchaseOrderFulfillmentStatus | null;
};

export const unloadedFulfillmentState: FulfillmentLoadState = {
  loaded: false,
  error: false,
  status: null,
};

export function canCancelWithFulfillment(state: FulfillmentLoadState) {
  return state.loaded &&
    !state.error &&
    (state.status === null || state.status === "confirmed");
}

export function createLatestRequestGuard() {
  let generation = 0;
  return {
    start() {
      const requestGeneration = ++generation;
      return () => requestGeneration === generation;
    },
    invalidate() {
      generation += 1;
    },
  };
}

export function appendPageById<RecordType extends { id: string }>(
  current: PageData<RecordType>,
  next: PageData<RecordType>,
): PageData<RecordType> {
  const records = new Map(
    current.list.map((record) => [record.id, record]),
  );
  for (const record of next.list) records.set(record.id, record);
  return {
    list: Array.from(records.values()),
    pagination: next.pagination,
  };
}

export function isUncertainCommandFailure(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return true;
  }
  return typeof error.status !== "number" || error.status >= 500;
}

export function commandRetryMessage(error: unknown, message: string) {
  return isUncertainCommandFailure(error)
    ? `${message}，可直接重试，系统会复用本次请求标识`
    : message;
}

export async function refreshAfterCommand(
  refresh: () => Promise<boolean>,
) {
  try {
    return await refresh();
  } catch {
    return false;
  }
}

function deepFreeze<Value>(value: Value): DeepReadonly<Value> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<Value>;
}

function frozenCommandStorageKey(
  sessionScope: string,
  orderId: string,
  kind: FrozenCommandKind,
) {
  return `${ADMIN_SESSION_STORAGE_PREFIX}${sessionScope}:purchase-order-fulfillment:${kind}:${orderId}`;
}

function isStoredFrozenCommand(
  value: unknown,
  sessionScope: string,
  orderId: string,
  kind: FrozenCommandKind,
): value is {
  attempt: SupplierCommandAttempt;
  payload: object;
  phase: "in_flight" | "uncertain";
  resourcePath: string;
} {
  if (!value || typeof value !== "object") return false;
  const stored = value as Record<string, unknown>;
  if (!stored.attempt || typeof stored.attempt !== "object") return false;
  const attempt = stored.attempt as Record<string, unknown>;
  return stored.schemaVersion === 2 &&
    stored.sessionScope === sessionScope &&
    stored.kind === kind &&
    stored.resourcePath === orderId &&
    (stored.phase === "in_flight" || stored.phase === "uncertain") &&
    isStoredPayload(stored.payload, kind) &&
    typeof attempt.fingerprint === "string" &&
    typeof attempt.idempotencyKey === "string" &&
    (kind === "confirm"
      ? attempt.resourceId === undefined
      : typeof attempt.resourceId === "string" &&
        (stored.payload as Record<string, unknown>).id === attempt.resourceId);
}

function isStoredPayload(value: unknown, kind: FrozenCommandKind) {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (kind === "confirm") {
    return isVersion(payload.expected_version) &&
      isDateString(payload.confirmed_at) &&
      isOptionalText(payload.remark);
  }
  if (
    typeof payload.id !== "string" ||
    !isVersion(payload.expected_fulfillment_version) ||
    !Array.isArray(payload.items)
  ) return false;
  if (kind === "shipment") {
    return typeof payload.shipment_no === "string" &&
      isDateString(payload.shipped_at) &&
      isOptionalText(payload.carrier_name) &&
      isOptionalText(payload.tracking_no) &&
      isOptionalText(payload.remark) &&
      payload.items.every((item) =>
        isRecord(item) &&
        typeof item.purchase_order_item_id === "string" &&
        isQuantity(item.quantity)
      );
  }
  return typeof payload.receipt_no === "string" &&
    isDateString(payload.received_at) &&
    isOptionalText(payload.remark) &&
    payload.items.every((item) =>
      isRecord(item) &&
      typeof item.purchase_order_item_id === "string" &&
      isQuantity(item.accepted_quantity) &&
      isQuantity(item.rejected_quantity) &&
      isOptionalText(item.variance_reason)
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isVersion(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isQuantity(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isDateString(value: unknown) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isOptionalText(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

function safeRemoveStoredCommand(
  storage: FrozenCommandStorage,
  key: string,
) {
  try {
    storage.removeItem(key);
  } catch {
    return;
  }
}
