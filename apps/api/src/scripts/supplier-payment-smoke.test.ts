import { describe, expect, test } from "bun:test";

import { SupplierPaymentCommandEnvelopeSchema } from
  "../repositories/supplier-payment-records";
import {
  SUPPLIER_PAYMENT_COMMAND_SEQUENCE,
  assertSupplierPaymentCommandEnvelope,
  executeSupplierPaymentCommandSequence,
} from "./supplier-payment-smoke-commands";
import { SUPPLIER_PAYMENT_SMOKE_IDS } from
  "./supplier-payment-smoke-fixture";
import {
  assertSupplierPaymentSmokeSummary,
  closeDatabasePreservingPrimaryFailure,
  runRollbackOnly,
  type SupplierPaymentSmokeSummary,
} from "./supplier-payment-smoke";

type FakeTransaction = { marker: string };

class FakeRollbackExecutor {
  commits = 0;
  rollbacks = 0;
  readonly transaction = { marker: "supplier-payment" };

  async begin<T>(callback: (transaction: FakeTransaction) => Promise<T>) {
    try {
      const result = await callback(this.transaction);
      this.commits += 1;
      return result;
    } catch (error) {
      this.rollbacks += 1;
      throw error;
    }
  }
}

const passingSummary: SupplierPaymentSmokeSummary = {
  receipt_cost_atomic: true,
  receipt_payable_atomic: true,
  receipt_replay_idempotent: true,
  split_receipt_rounding_exact: true,
  rejected_quantity_excluded: true,
  commitment_partially_consumed: true,
  concurrent_request_serialized: true,
  rejected_request_released: true,
  partial_payment_recorded: true,
  repeated_payment_idempotent: true,
  final_payment_closed_balance: true,
  invoice_gate_atomic: true,
  supplier_cash_single_ledger: true,
  supplier_cash_not_double_costed: true,
  tenant_isolation: true,
  transaction_rolled_back: true,
};

describe("supplier payment database smoke helpers", () => {
  test("uses stable and unique version-four UUIDs", () => {
    const ids = Object.values(SUPPLIER_PAYMENT_SMOKE_IDS);
    expect(ids.length).toBeGreaterThanOrEqual(16);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
        .test(value)
    )).toBe(true);
  });

  test("exposes the two canonical package commands", async () => {
    const packageJson: { scripts: Record<string, string> } = await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json();

    expect(packageJson.scripts["supplier:payment:smoke"]).toBe(
      "bun src/scripts/supplier-payment-smoke.ts",
    );
    expect(packageJson.scripts["supplier:payment:explain"]).toBe(
      "bun src/scripts/supplier-payment-explain.ts",
    );
  });

  test("returns only after the transaction has rolled back", async () => {
    const database = new FakeRollbackExecutor();

    const result = await runRollbackOnly(database, async (transaction) => {
      expect(transaction).toBe(database.transaction);
      return { receipt: true };
    });

    expect(result).toEqual({ receipt: true });
    expect(database.rollbacks).toBe(1);
    expect(database.commits).toBe(0);
  });

  test("rethrows the original callback failure after rollback", async () => {
    const database = new FakeRollbackExecutor();
    const failure = new Error("primary supplier payment smoke failure");

    await expect(runRollbackOnly(database, async () => {
      throw failure;
    })).rejects.toBe(failure);
    expect(database.rollbacks).toBe(1);
    expect(database.commits).toBe(0);
  });

  test("keeps the primary failure if close also fails", async () => {
    const primaryFailure = new Error("primary failure");
    const closeFailure = new Error("close failure");

    await expect(closeDatabasePreservingPrimaryFailure({
      async close() {
        throw closeFailure;
      },
    }, { failed: true, value: primaryFailure })).rejects.toBe(primaryFailure);
    await expect(closeDatabasePreservingPrimaryFailure({
      async close() {
        throw closeFailure;
      },
    }, { failed: false })).rejects.toBe(closeFailure);
  });

  test("requires exactly the sixteen named true checks", () => {
    expect(assertSupplierPaymentSmokeSummary(passingSummary))
      .toEqual(passingSummary);
    expect(() => assertSupplierPaymentSmokeSummary({
      ...passingSummary,
      supplier_cash_single_ledger: false,
    })).toThrow("supplier_cash_single_ledger");
    const { tenant_isolation: _missing, ...missing } = passingSummary;
    expect(() => assertSupplierPaymentSmokeSummary(missing))
      .toThrow("exactly 16 checks");
    expect(() => assertSupplierPaymentSmokeSummary({
      ...passingSummary,
      unexpected: true,
    })).toThrow("exactly 16 checks");
    expect(() => assertSupplierPaymentSmokeSummary({
      ...passingSummary,
      partial_payment_recorded: "true",
    })).toThrow("partial_payment_recorded");
  });

  test("runs the deterministic command sequence without sleeps", async () => {
    const observed: string[] = [];
    const result = await executeSupplierPaymentCommandSequence({
      async execute(step) {
        observed.push(step);
        return step;
      },
    });

    expect(observed).toEqual([...SUPPLIER_PAYMENT_COMMAND_SEQUENCE]);
    expect(result).toEqual([...SUPPLIER_PAYMENT_COMMAND_SEQUENCE]);
    expect(SUPPLIER_PAYMENT_COMMAND_SEQUENCE).toEqual([
      "partial_receipt",
      "final_receipt",
      "receipt_replay",
      "save_competing_requests",
      "submit_competing_requests",
      "reject_reserved_request",
      "resubmit_released_request",
      "approve_payment_request",
      "partial_payment",
      "partial_payment_replay",
      "final_payment",
      "invoice_request",
      "invoice_payment_gate",
      "tenant_isolation",
    ]);
  });

  test("uses the frozen strict payment command envelope", () => {
    const error = {
      status: "invoice_required",
      error_code: "SUPPLIER_PAYMENT_INVOICE_REQUIRED",
    } as const;
    expect(assertSupplierPaymentCommandEnvelope(error)).toEqual(error);
    expect(SupplierPaymentCommandEnvelopeSchema.safeParse(error).success)
      .toBe(true);
    expect(() => assertSupplierPaymentCommandEnvelope({
      ...error,
      reason: "unexpected",
    })).toThrow("payment command envelope");
  });
});
