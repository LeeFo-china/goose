import {
  SupplierPaymentSmokeAssertionError,
  type PayableFact,
  type RequestAllocationFact,
} from "./supplier-payment-smoke-commands";
import type {
  SupplierPaymentSmokeFixture,
} from "./supplier-payment-smoke-fixture";
import type { ProjectCostSnapshot } from
  "./supplier-payment-smoke-assertions";

export type SupplierPaymentScenarioState = {
  fixture: SupplierPaymentSmokeFixture;
  mainPayables: PayableFact[];
  invoicePayables: PayableFact[];
  activeRequestId?: string;
  activeAllocations: RequestAllocationFact[];
  projectCostBeforePayment?: ProjectCostSnapshot;
  checks: Record<string, true>;
};

export function paymentSmokeAssert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new SupplierPaymentSmokeAssertionError(message);
  }
}

export function paymentSmokeCents(value: string): number {
  paymentSmokeAssert(
    /^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value),
    "invalid money",
  );
  return Math.round(Number(value) * 100);
}
