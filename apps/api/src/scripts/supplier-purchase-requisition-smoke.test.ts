import { describe, expect, test } from "bun:test";

import {
  REQUISITION_SMOKE_SQL_CONTRACTS,
  SMOKE_IDS,
  assertExplainUsesIndex,
  assertRequisitionCommandResult,
  assertSmokeSummary,
  observeBlockedUntilRelease,
  runWithForcedRollback,
} from "./supplier-purchase-requisition-smoke";

type FakeTransaction = { marker: string };

class FakeDatabase {
  commits = 0;
  rollbacks = 0;
  readonly transaction: FakeTransaction;

  constructor(marker: string) {
    this.transaction = { marker };
  }

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const passingSummary = {
  save_replay: true,
  idempotency_conflict: true,
  version_conflict: true,
  self_review_rejected: true,
  concurrent_budget_serialized: true,
  rejection_released: true,
  cancellation_released: true,
  conversion_unique: true,
  cross_tenant_hidden: true,
  explain_uses_index: true,
};

describe("supplier purchase requisition database smoke helpers", () => {
  test("uses stable, unique UUIDs for rollback-only fixtures", () => {
    expect(SMOKE_IDS.requisition).toBe(
      "35000000-0000-4000-8000-000000000001",
    );
    expect(new Set(Object.values(SMOKE_IDS)).size).toBe(
      Object.values(SMOKE_IDS).length,
    );
    expect(Object.values(SMOKE_IDS).every((value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
        .test(value)
    )).toBe(true);
  });

  test("forces rollback and preserves callback results and failures", async () => {
    const database = new FakeDatabase("single");
    expect(await runWithForcedRollback(database, async (transaction) => {
      expect(transaction.marker).toBe("single");
      return { saved: true };
    })).toEqual({ saved: true });
    expect(database.rollbacks).toBe(1);
    expect(database.commits).toBe(0);

    const failure = new Error("smoke assertion failed");
    await expect(runWithForcedRollback(database, async () => {
      throw failure;
    })).rejects.toBe(failure);
    expect(database.rollbacks).toBe(2);
  });

  test("requires exactly ten passing evidence fields", () => {
    expect(assertSmokeSummary(passingSummary)).toEqual(passingSummary);
    expect(() => assertSmokeSummary({
      ...passingSummary,
      explain_uses_index: false,
    })).toThrow("explain_uses_index");
    expect(() => assertSmokeSummary({
      ...passingSummary,
      unexpected: true,
    })).toThrow("unexpected");
  });

  test("validates requisition command status, replay and version facts", () => {
    expect(assertRequisitionCommandResult({
      status: "submitted",
      idempotent: false,
      version: 2,
      requisition: {
        status: "pending_approval",
        budget_status: "within_budget",
        total_amount: "200.00",
      },
    }, {
      status: "submitted",
      idempotent: false,
      version: 2,
    }).version).toBe(2);
    expect(() => assertRequisitionCommandResult({
      status: "submitted",
      idempotent: false,
      version: 2,
      requisition: { total_amount: 200 },
    }, {
      status: "submitted",
      idempotent: false,
      version: 2,
    })).toThrow("requisition.total_amount");
  });

  test("accepts only plans using the active commitment index", () => {
    expect(assertExplainUsesIndex([
      {
        "QUERY PLAN":
          "Bitmap Index Scan on project_cost_commitments_active_lookup_idx",
      },
    ])).toBe(true);
    expect(() => assertExplainUsesIndex([
      { "QUERY PLAN": "Seq Scan on project_cost_commitments" },
    ])).toThrow("project_cost_commitments_active_lookup_idx");
  });

  test("holds the second operation until release and rolls back both transactions", async () => {
    const databaseA = new FakeDatabase("A");
    const databaseB = new FakeDatabase("B");
    const operationStarted = deferred<void>();
    const releaseA = deferred<void>();
    const operationB = runWithForcedRollback(databaseB, async () => {
      operationStarted.resolve();
      await releaseA.promise;
      return "B submitted";
    });
    await operationStarted.promise;

    const observed = await observeBlockedUntilRelease(
      operationB,
      async () => releaseA.resolve(),
      10,
    );
    expect(observed).toBe("B submitted");
    expect(databaseB.rollbacks).toBe(1);
    expect(databaseB.commits).toBe(0);

    await runWithForcedRollback(databaseA, async () => "A submitted");
    expect(databaseA.rollbacks).toBe(1);
    expect(databaseA.commits).toBe(0);
  });

  test("pins the migration RPC, table and index contract", () => {
    expect(REQUISITION_SMOKE_SQL_CONTRACTS).toEqual({
      save: "public.save_supplier_purchase_requisition_draft",
      submit: "public.submit_supplier_purchase_requisition",
      review: "public.review_supplier_purchase_requisition",
      cancel: "public.cancel_supplier_purchase_requisition",
      convert: "public.convert_supplier_purchase_requisition",
      requisitions: "public.supplier_purchase_requisitions",
      commitments: "public.project_cost_commitments",
      activeCommitmentIndex:
        "project_cost_commitments_active_lookup_idx",
    });
  });

  test("binds every summary field to executable SQL evidence", async () => {
    const mainSource = await Bun.file(new URL(
      "./supplier-purchase-requisition-smoke.ts",
      import.meta.url,
    )).text();
    const sqlSource = await Bun.file(new URL(
      "./supplier-purchase-requisition-smoke-sql.ts",
      import.meta.url,
    )).text();
    const concurrencySource = await Bun.file(new URL(
      "./supplier-purchase-requisition-smoke-concurrency.ts",
      import.meta.url,
    )).text();

    for (const rpc of [
      REQUISITION_SMOKE_SQL_CONTRACTS.save,
      REQUISITION_SMOKE_SQL_CONTRACTS.submit,
      REQUISITION_SMOKE_SQL_CONTRACTS.review,
      REQUISITION_SMOKE_SQL_CONTRACTS.cancel,
      REQUISITION_SMOKE_SQL_CONTRACTS.convert,
    ]) {
      expect(sqlSource).toContain(rpc);
    }
    expect(mainSource).toContain(REQUISITION_SMOKE_SQL_CONTRACTS.commitments);
    expect(mainSource).toContain(
      REQUISITION_SMOKE_SQL_CONTRACTS.activeCommitmentIndex,
    );
    expect(concurrencySource).toContain(
      "get_tenant_supplier_order_eligibility_set",
    );
    expect(concurrencySource).toContain(
      "const bResult = await observe(operationB",
    );
    expect(concurrencySource).toContain("assertSubmitted(bResult");
    for (const key of Object.keys(passingSummary)) {
      expect(mainSource).not.toMatch(new RegExp(`${key}:\\s*true`));
    }
  });
});
