import { SupplierPaymentSmokeAssertionError } from
  "./supplier-payment-smoke-commands";

export type SupplierPaymentFailureState =
  | { failed: false }
  | { failed: true; value: unknown; suppressed?: unknown[] };

type Closable = {
  close(): Promise<void>;
};

export function captureSupplierPaymentFailure(
  current: SupplierPaymentFailureState,
  value: unknown,
): SupplierPaymentFailureState {
  return current.failed
    ? {
      ...current,
      suppressed: [...(current.suppressed ?? []), value],
    }
    : { failed: true, value };
}

export function throwSupplierPaymentFailures(
  failure: SupplierPaymentFailureState,
): void {
  if (!failure.failed) return;
  const errors = [failure.value, ...(failure.suppressed ?? [])];
  if (errors.length === 1) throw failure.value;
  throw new AggregateError(
    errors,
    "SUPPLIER_PAYMENT_SMOKE_FINALIZATION_FAILED",
    { cause: failure.value },
  );
}

export async function closeThenCheckFreshResidual<
  Connection extends Closable,
>(input: {
  original: Connection;
  createFresh(): Connection;
  countResidual(connection: Connection): Promise<number>;
  primaryFailure: SupplierPaymentFailureState;
  label?: string;
}): Promise<void> {
  let failure = input.primaryFailure;
  try {
    await input.original.close();
  } catch (error) {
    failure = captureSupplierPaymentFailure(failure, error);
  }

  let fresh: Connection | undefined;
  try {
    fresh = input.createFresh();
    const residual = await input.countResidual(fresh);
    if (residual !== 0) {
      throw new SupplierPaymentSmokeAssertionError(
        `${input.label ?? "supplier payment"} residual must be zero`,
      );
    }
  } catch (error) {
    failure = captureSupplierPaymentFailure(failure, error);
  }

  if (fresh) {
    try {
      await fresh.close();
    } catch (error) {
      failure = captureSupplierPaymentFailure(failure, error);
    }
  }
  throwSupplierPaymentFailures(failure);
}
