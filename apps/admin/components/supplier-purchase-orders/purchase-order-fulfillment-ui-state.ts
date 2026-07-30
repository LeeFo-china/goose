import type {
  PurchaseOrderFulfillmentStatus,
} from "./purchase-order-fulfillment-types";
import type { PageData } from "./purchase-order-types";

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

export function shouldClearCommandAttempt(error: unknown) {
  return !isUncertainCommandFailure(error);
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
