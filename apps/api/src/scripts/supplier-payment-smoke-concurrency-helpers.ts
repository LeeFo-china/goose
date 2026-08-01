import { SupplierPaymentSmokeAssertionError } from
  "./supplier-payment-smoke-commands";

export type ConcurrencyRunIdentity = {
  marker: string;
  requestA: string;
  requestB: string;
  saveA: string;
  saveB: string;
  submitA: string;
  submitB: string;
};

export type MonotonicDeadline = {
  deadlineAt: number;
  now(): number;
  delay(milliseconds: number): Promise<void>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function concurrencyPrerequisite(message: string): never {
  throw new SupplierPaymentSmokeAssertionError(
    `SUPPLIER_PAYMENT_SMOKE_PREREQUISITE_CONCURRENCY_${message}`,
  );
}

export function createConcurrencyRunIdentity(
  idFactory: () => string = () => crypto.randomUUID(),
): ConcurrencyRunIdentity {
  const identity = {
    marker: idFactory(),
    requestA: idFactory(),
    requestB: idFactory(),
    saveA: idFactory(),
    saveB: idFactory(),
    submitA: idFactory(),
    submitB: idFactory(),
  };
  if (
    new Set(Object.values(identity)).size !== 7 ||
    !Object.values(identity).every((value) => UUID_PATTERN.test(value))
  ) {
    concurrencyPrerequisite("GENERATED_IDS_NOT_UNIQUE");
  }
  return identity;
}

export async function prepareConcurrencyRun(input: {
  identity: ConcurrencyRunIdentity;
  countConflicts(identity: ConcurrencyRunIdentity): Promise<number>;
  seed(identity: ConcurrencyRunIdentity): Promise<void>;
}): Promise<void> {
  if (await input.countConflicts(input.identity) !== 0) {
    concurrencyPrerequisite("GENERATED_IDS_CONFLICT");
  }
  await input.seed(input.identity);
}

export function createMonotonicDeadline(
  timeoutMs: number,
): MonotonicDeadline {
  const now = () => performance.now();
  return {
    deadlineAt: now() + timeoutMs,
    now,
    delay: (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  };
}

function deadlineFailure(label: string): never {
  concurrencyPrerequisite(`${label}_DEADLINE`);
}

export async function waitForPromiseBeforeDeadline<Value>(
  operation: Promise<Value>,
  deadline: MonotonicDeadline,
  label: string,
): Promise<Value> {
  const remaining = deadline.deadlineAt - deadline.now();
  if (remaining <= 0) deadlineFailure(label);
  return new Promise<Value>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        deadlineFailure(label);
      } catch (error) {
        reject(error);
      }
    }, remaining);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function pollUntilBeforeDeadline(input: {
  label: string;
  deadlineAt: number;
  probe(): Promise<boolean>;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  backoffMs?: number;
}): Promise<void> {
  const now = input.now ?? (() => performance.now());
  const delay = input.delay ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const backoff = input.backoffMs ?? 5;
  while (now() < input.deadlineAt) {
    if (await input.probe()) return;
    const remaining = input.deadlineAt - now();
    if (remaining > 0) await delay(Math.min(backoff, remaining));
  }
  deadlineFailure(input.label);
}
