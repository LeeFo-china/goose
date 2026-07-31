import { describe, expect, test } from "bun:test";

import { SupplierPaymentCommandEnvelopeSchema } from
  "../repositories/supplier-payment-records";
import * as paymentFlowModule from "./supplier-payment-smoke-payment-flow";
import * as paymentSmokeModule from "./supplier-payment-smoke";
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

type CommittedConcurrencyConfig = {
  databaseUrl: string;
  allowCommittedConcurrency?: string;
  disposableDatabase?: string;
  payableId?: string;
};

type OverlapClient = {
  clientId: "A" | "B";
  begin<Result>(
    callback: (transaction: { clientId: "A" | "B" }) => Promise<Result>,
  ): Promise<Result>;
};

const smokeFixes = paymentSmokeModule as typeof paymentSmokeModule & {
  assertCommittedConcurrencyConfig(
    input: CommittedConcurrencyConfig,
  ): { payableId: string };
  runConcurrentSubmitOverlap<Result>(input: {
    clients: readonly [OverlapClient, OverlapClient];
    submit(
      clientId: "A" | "B",
      transaction: { clientId: "A" | "B" },
    ): Promise<Result>;
    waitForSecondBlocked(): Promise<void>;
  }): Promise<readonly [Result, Result]>;
  closeThenCheckFreshResidual<Connection extends { close(): Promise<void> }>(
    input: {
      original: Connection;
      createFresh(): Connection;
      countResidual(connection: Connection): Promise<number>;
      primaryFailure:
        | { failed: false }
        | { failed: true; value: unknown };
    },
  ): Promise<void>;
};

const paymentFlowFixes = paymentFlowModule as typeof paymentFlowModule & {
  assertInvoiceGateSnapshotUnchanged(
    before: unknown,
    after: unknown,
  ): true;
  assertProjectCostSnapshotUnchanged(
    before: unknown,
    after: unknown,
  ): true;
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
      "self_review_rejected",
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
    expect(assertSupplierPaymentCommandEnvelope({
      status: "self_review",
      error_code: "SUPPLIER_PAYMENT_SELF_REVIEW",
    })).toEqual({
      status: "self_review",
      error_code: "SUPPLIER_PAYMENT_SELF_REVIEW",
    });
  });

  test("requires explicit loopback disposable configuration for committed concurrency", () => {
    const allowed = {
      databaseUrl: "postgres://postgres:secret@127.0.0.1:54322/postgres",
      allowCommittedConcurrency: "1",
      disposableDatabase: "1",
      payableId: "87000000-0000-4000-8000-000000000001",
    };
    expect(smokeFixes.assertCommittedConcurrencyConfig(allowed)).toEqual({
      payableId: allowed.payableId,
    });
    expect(() => smokeFixes.assertCommittedConcurrencyConfig({
      ...allowed,
      payableId: undefined,
    })).toThrow("CONCURRENCY_PAYABLE_ID");
    expect(() => smokeFixes.assertCommittedConcurrencyConfig({
      ...allowed,
      databaseUrl: "postgres://postgres:secret@db.example.supabase.co/db",
    })).toThrow("LOOPBACK");
    expect(() => smokeFixes.assertCommittedConcurrencyConfig({
      ...allowed,
      disposableDatabase: undefined,
    })).toThrow("DISPOSABLE");
  });

  test("locks committed concurrency to an explicit payable without candidate scanning", async () => {
    const source = await Bun.file(new URL(
      "./supplier-payment-smoke-concurrency.ts",
      import.meta.url,
    )).text();
    expect(source).toContain(
      "where payable.id = ${payableId}::uuid;",
    );
    expect(source).not.toContain("limit 1");
    expect(source).not.toContain("order by payable");

    const flowSource = await Bun.file(new URL(
      "./supplier-payment-smoke-payment-flow.ts",
      import.meta.url,
    )).text();
    expect(flowSource).not.toContain(
      "state.checks.concurrent_request_serialized",
    );
  });

  test("overlaps submissions on two distinguishable clients behind a barrier", async () => {
    const events: string[] = [];
    let releaseB!: () => void;
    const waitForACommit = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    function client(clientId: "A" | "B"): OverlapClient {
      return {
        clientId,
        async begin<Result>(callback: (
          transaction: { clientId: "A" | "B" },
        ) => Promise<Result>) {
          events.push(`${clientId}:begin`);
          const result = await callback({ clientId });
          events.push(`${clientId}:commit`);
          if (clientId === "A") releaseB();
          return result;
        },
      };
    }
    const result = await smokeFixes.runConcurrentSubmitOverlap({
      clients: [client("A"), client("B")],
      async submit(clientId, transaction) {
        expect(transaction.clientId).toBe(clientId);
        events.push(`${clientId}:submit`);
        if (clientId === "B") await waitForACommit;
        return clientId === "A" ? "submitted" : "amount_unavailable";
      },
      async waitForSecondBlocked() {
        events.push("B:blocked");
        expect(events).toContain("A:submit");
        expect(events).toContain("B:submit");
        expect(events).not.toContain("A:commit");
      },
    });
    expect(result).toEqual(["submitted", "amount_unavailable"]);
    expect(events).toEqual([
      "A:begin",
      "A:submit",
      "B:begin",
      "B:submit",
      "B:blocked",
      "A:commit",
      "B:commit",
    ]);

    const sameClient = client("A");
    await expect(smokeFixes.runConcurrentSubmitOverlap({
      clients: [sameClient, sameClient],
      async submit() {
        return "submitted";
      },
      async waitForSecondBlocked() {},
    })).rejects.toThrow("DISTINCT_CLIENTS");
  });

  test("keeps invoice request, allocations and cash facts unchanged", () => {
    const snapshot = {
      request: {
        status: "approved",
        version: 3,
        paid_amount: "0.00",
      },
      allocations: [{
        id: "allocation-a",
        tenant_id: "tenant-a",
        payment_request_id: "request-a",
        payable_event_id: "payable-a",
        requested_amount: "30.00",
        paid_amount: "0.00",
        created_at: "2026-07-31T00:00:00.000Z",
        updated_at: "2026-07-31T00:00:00.000Z",
      }],
      payment_count: 0,
      payment_allocation_count: 0,
      ledger_count: 0,
    };
    expect(paymentFlowFixes.assertInvoiceGateSnapshotUnchanged(
      snapshot,
      structuredClone(snapshot),
    )).toBe(true);
    expect(() => paymentFlowFixes.assertInvoiceGateSnapshotUnchanged(
      snapshot,
      {
        ...structuredClone(snapshot),
        request: { ...snapshot.request, version: 4 },
      },
    )).toThrow("invoice gate");
    expect(() => paymentFlowFixes.assertInvoiceGateSnapshotUnchanged(
      snapshot,
      {
        ...structuredClone(snapshot),
        allocations: [{
          ...snapshot.allocations[0]!,
          paid_amount: "1.00",
        }],
      },
    )).toThrow("invoice gate");
    for (const changedAllocation of [
      {
        ...snapshot.allocations[0]!,
        requested_amount: "29.00",
      },
      {
        ...snapshot.allocations[0]!,
        payable_event_id: "payable-b",
      },
      {
        ...snapshot.allocations[0]!,
        updated_at: "2026-07-31T00:00:01.000Z",
      },
    ]) {
      expect(() => paymentFlowFixes.assertInvoiceGateSnapshotUnchanged(
        snapshot,
        {
          ...structuredClone(snapshot),
          allocations: [changedAllocation],
        },
      )).toThrow("invoice gate");
    }
  });

  test("snapshots every allocation column in stable tenant-request order", async () => {
    const source = await Bun.file(new URL(
      "./supplier-payment-smoke-assertions.ts",
      import.meta.url,
    )).text();
    expect(source).toContain("to_jsonb(allocation.*)");
    expect(source).toContain("jsonb_agg(");
    expect(source).toContain("order by allocation.id");
    expect(source).toContain(
      "allocation.tenant_id = ${fixture.tenant_id}::uuid",
    );
    expect(source).toContain(
      "allocation.payment_request_id = ${requestId}::uuid",
    );
  });

  test("keeps whole-project cost totals unchanged after supplier cash", () => {
    const snapshot = {
      count: 3,
      amount: "42.50",
      supplier_payment_source_count: 0,
    };
    expect(paymentFlowFixes.assertProjectCostSnapshotUnchanged(
      snapshot,
      { ...snapshot },
    )).toBe(true);
    expect(() => paymentFlowFixes.assertProjectCostSnapshotUnchanged(
      snapshot,
      { ...snapshot, count: 4 },
    )).toThrow("project cost");
    expect(() => paymentFlowFixes.assertProjectCostSnapshotUnchanged(
      snapshot,
      { ...snapshot, supplier_payment_source_count: 1 },
    )).toThrow("supplier_payment");
  });

  test("closes the original pool before checking residuals on a fresh pool", async () => {
    const primaryFailure = new Error("primary");
    const events: string[] = [];
    const original = {
      async close() {
        events.push("original:close");
        throw new Error("original close");
      },
    };
    await expect(smokeFixes.closeThenCheckFreshResidual({
      original,
      createFresh() {
        events.push("fresh:create");
        return {
          async close() {
            events.push("fresh:close");
          },
        };
      },
      async countResidual() {
        events.push("fresh:count");
        return 0;
      },
      primaryFailure: { failed: true, value: primaryFailure },
    })).rejects.toBe(primaryFailure);
    expect(events).toEqual([
      "original:close",
      "fresh:create",
      "fresh:count",
      "fresh:close",
    ]);
  });
});
