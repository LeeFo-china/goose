import {
  executeSupplierPaymentCommandSequence,
} from "./supplier-payment-smoke-commands";
import {
  type SupplierPaymentSmokeFixture,
  type SupplierPaymentSmokeSql,
} from "./supplier-payment-smoke-fixture";
import { executeSupplierPaymentFlowStep } from
  "./supplier-payment-smoke-payment-flow";
import { executeSupplierPaymentReceiptStep } from
  "./supplier-payment-smoke-receipts";
import type { SupplierPaymentScenarioState } from
  "./supplier-payment-smoke-state";

export async function executeSupplierPaymentSmokeScenario(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
): Promise<Record<string, true>> {
  const state: SupplierPaymentScenarioState = {
    fixture,
    mainPayables: [],
    invoicePayables: [],
    activeAllocations: [],
    checks: {},
  };
  await sql`select set_config('statement_timeout', '15000', true);`;
  await sql`select set_config('lock_timeout', '3000', true);`;
  await executeSupplierPaymentCommandSequence({
    execute: (step) => step.endsWith("receipt") || step === "receipt_replay"
      ? executeSupplierPaymentReceiptStep(sql, state, step)
      : executeSupplierPaymentFlowStep(sql, state, step),
  });
  return state.checks;
}
