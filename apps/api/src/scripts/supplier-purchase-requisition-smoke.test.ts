import { describe, expect, test } from "bun:test";

import {
  REQUISITION_SMOKE_SQL_CONTRACTS,
  SMOKE_IDS,
  assertExplainUsesIndex,
  assertRequisitionCommandResult,
  assertSmokeSummary,
  runWithForcedRollback,
} from "./supplier-purchase-requisition-smoke";
import {
  assertConcurrentBudgetEvidence,
} from "./supplier-purchase-requisition-smoke-concurrency";
import {
  cleanupConcurrentBudgetResources,
  pollForBudgetAdvisoryLock,
  waitForOperationCompletion,
} from "./supplier-purchase-requisition-smoke-budget-lock";

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

function manualTimeoutScheduler() {
  let nextToken = 1;
  const callbacks = new Map<unknown, () => void>();
  const cleared: unknown[] = [];
  return {
    scheduler: {
      set(callback: () => void) {
        const token = nextToken;
        nextToken += 1;
        callbacks.set(token, callback);
        return token;
      },
      clear(token: unknown) {
        callbacks.delete(token);
        cleared.push(token);
      },
    },
    fireNext() {
      const next = callbacks.entries().next().value;
      if (!next) throw new Error("no pending timeout");
      const [token, callback] = next;
      callbacks.delete(token);
      callback();
    },
    pendingCount: () => callbacks.size,
    cleared,
  };
}

describe("supplier purchase requisition database smoke helpers", () => {
  test("uses stable, unique UUIDs for rollback-only fixtures", () => {
    expect(SMOKE_IDS.requisition).toBe(
      "35000000-0000-4000-8000-000000000001",
    );
    expect(SMOKE_IDS.purchaseOrderConflict).toBe(
      "35000000-0000-4000-8000-000000000009",
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
          "Bitmap Index Scan on project_cost_commitments_active_lookup_idx " +
          "(actual time=0.010..0.011 rows=1 loops=1)",
      },
      { "QUERY PLAN": "Buffers: shared hit=2" },
    ])).toBe(true);
    expect(() => assertExplainUsesIndex([
      { "QUERY PLAN": "Seq Scan on project_cost_commitments" },
    ])).toThrow("project_cost_commitments_active_lookup_idx");
    expect(() => assertExplainUsesIndex([
      {
        "QUERY PLAN":
          "Index Scan using project_cost_commitments_active_lookup_idx",
      },
    ])).toThrow("runtime");
  });

  test("proves two individually affordable submissions contend for one budget", () => {
    expect(assertConcurrentBudgetEvidence({
      a: {
        requisition: {
          supplier_id: "supplier-a",
          budget_status: "within_budget",
          total_amount: "600.00",
        },
        commitments: [{
          status: "reserved",
          amount: "600.00",
          available_amount_snapshot: "1000.00",
        }],
      },
      b: {
        requisition: {
          supplier_id: "supplier-b",
          budget_status: "within_budget",
          total_amount: "600.00",
        },
        commitments: [{
          status: "reserved",
          amount: "600.00",
          available_amount_snapshot: "1000.00",
        }],
      },
    })).toBe(true);
    expect(() => assertConcurrentBudgetEvidence({
      a: {
        requisition: {
          supplier_id: "same-supplier",
          budget_status: "within_budget",
          total_amount: "400.00",
        },
        commitments: [{
          status: "reserved",
          amount: "400.00",
          available_amount_snapshot: "1000.00",
        }],
      },
      b: {
        requisition: {
          supplier_id: "same-supplier",
          budget_status: "within_budget",
          total_amount: "400.00",
        },
        commitments: [{
          status: "reserved",
          amount: "400.00",
          available_amount_snapshot: "1000.00",
        }],
      },
    })).toThrow("distinct suppliers");
  });

  test("polls until the second backend waits on the exact budget advisory lock", async () => {
    let probes = 0;
    let retries = 0;
    const evidence = await pollForBudgetAdvisoryLock(
      async () => {
        probes += 1;
        if (probes === 1) {
          return {
            pid: 90210,
            wait_event_type: "Client",
            wait_event: "ClientRead",
            locktype: "advisory",
            granted: false,
            objsubid: 1,
          };
        }
        return {
          pid: 90210,
          wait_event_type: "Lock",
          wait_event: "advisory",
          locktype: "advisory",
          granted: false,
          objsubid: 1,
        };
      },
      {
        maxAttempts: 2,
        waitForRetry: async () => {
          retries += 1;
        },
      },
    );
    expect(evidence.pid).toBe(90210);
    expect(probes).toBe(2);
    expect(retries).toBe(1);
  });

  test("fails after bounded probes without direct budget lock evidence", async () => {
    let probes = 0;
    await expect(pollForBudgetAdvisoryLock(
      async () => {
        probes += 1;
        return undefined;
      },
      {
        maxAttempts: 3,
        waitForRetry: async () => {},
      },
    )).rejects.toThrow("did not expose");
    expect(probes).toBe(3);
  });

  test("bounds never-settling cleanup, closes pools, and preserves the primary failure", async () => {
    const neverSettles = new Promise<never>(() => {});
    const primaryFailure = new Error("primary smoke failure");
    const timers = manualTimeoutScheduler();
    const closeOptions: Array<{ timeout?: number } | undefined> = [];
    const neverCloses = new Promise<void>(() => {});
    const connections = Array.from({ length: 3 }, (_, index) => ({
      close(options?: { timeout?: number }) {
        closeOptions.push(options);
        return index === 0 ? neverCloses : Promise.resolve();
      },
    }));
    const cleanup = cleanupConcurrentBudgetResources({
      operations: [neverSettles],
      connections,
      primaryFailure,
      operationTimeoutMilliseconds: 5_000,
      closeWaitMilliseconds: 2_000,
      closeTimeoutSeconds: 1,
      scheduler: timers.scheduler,
    });
    await Promise.resolve();
    expect(closeOptions).toHaveLength(0);

    timers.fireNext();
    for (let turn = 0; turn < 10 && closeOptions.length === 0; turn += 1) {
      await Promise.resolve();
    }

    expect(closeOptions).toEqual([
      { timeout: 1 },
      { timeout: 1 },
      { timeout: 1 },
    ]);
    timers.fireNext();

    await expect(cleanup).rejects.toBe(primaryFailure);
    expect(timers.pendingCount()).toBe(0);
    expect(timers.cleared).toHaveLength(2);
  });

  test("clears the timeout when an operation completes or fails early", async () => {
    const timers = manualTimeoutScheduler();
    await expect(waitForOperationCompletion(
      Promise.resolve("submitted"),
      5_000,
      timers.scheduler,
    )).resolves.toBe("submitted");
    expect(timers.pendingCount()).toBe(0);
    expect(timers.cleared).toHaveLength(1);

    const failure = new Error("operation failed");
    const failedTimers = manualTimeoutScheduler();
    await expect(waitForOperationCompletion(
      Promise.reject(failure),
      5_000,
      failedTimers.scheduler,
    )).rejects.toBe(failure);
    expect(failedTimers.pendingCount()).toBe(0);
    expect(failedTimers.cleared).toHaveLength(1);
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

  test("exposes only the planned Task10 requisition smoke command", async () => {
    const packageJson = await Bun.file(new URL(
      "../../package.json",
      import.meta.url,
    )).json() as { scripts: Record<string, string> };
    expect(packageJson.scripts["supplier:purchase-requisition:smoke"]).toBe(
      "bun src/scripts/supplier-purchase-requisition-smoke.ts",
    );
    expect(packageJson.scripts).not.toHaveProperty(
      "supplier:purchase-requisition-smoke",
    );
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
    const budgetLockSource = await Bun.file(new URL(
      "./supplier-purchase-requisition-smoke-budget-lock.ts",
      import.meta.url,
    )).text();
    const planSource = await Bun.file(new URL(
      "./supplier-purchase-requisition-smoke-plan.ts",
      import.meta.url,
    )).text();

    expect(mainSource.match(
      /new Bun\.SQL\(databaseUrl, \{ max: 1, prepare: false \}\)/g,
    )).toHaveLength(1);
    expect(concurrencySource.match(
      /new Bun\.SQL\(databaseUrl, \{ max: 1, prepare: false \}\)/g,
    )).toHaveLength(3);
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
    expect(budgetLockSource).toContain("pg_backend_pid()");
    expect(concurrencySource).toContain("waitForBudgetAdvisoryLock");
    expect(concurrencySource).toContain("waitForOperationCompletion");
    expect(concurrencySource).toContain(
      "cleanupConcurrentBudgetResources",
    );
    expect(concurrencySource).not.toContain("await Promise.allSettled");
    expect(concurrencySource).not.toContain("setTimeout(");
    expect(concurrencySource).toContain(
      "cardinality(type.applicable_supplier_types) = 0",
    );
    expect(concurrencySource).toContain(
      "markBSaved(await readBackendPid(sql))",
    );
    expect(
      concurrencySource.indexOf("await waitForBudgetAdvisoryLock"),
    ).toBeLessThan(concurrencySource.indexOf("releaseA?.()"));
    expect(
      concurrencySource.indexOf("releaseA?.()"),
    ).toBeLessThan(
      concurrencySource.indexOf("await waitForOperationCompletion"),
    );
    expect(concurrencySource).toContain("assertSubmitted(bResult");
    expect(concurrencySource).toContain("bSaved");
    expect(concurrencySource).toContain("seedConcurrentSupplier");
    expect(concurrencySource).toContain("countConcurrentFixtureRows");
    expect(budgetLockSource).toContain("pg_catalog.pg_stat_activity");
    expect(budgetLockSource).toContain("pg_catalog.pg_locks");
    expect(budgetLockSource).toContain("supplier-project-budget:");
    expect(budgetLockSource).toContain("6720240730150000");
    expect(budgetLockSource).toContain("activity.wait_event_type = 'Lock'");
    expect(budgetLockSource).toContain("activity.wait_event = 'advisory'");
    expect(budgetLockSource).toContain("requested.granted = false");
    expect(budgetLockSource).toContain("requested.objsubid = 1");
    expect(budgetLockSource).toContain("requested.classid::bigint << 32");
    expect(mainSource).not.toContain("observeBlockedUntilRelease");
    expect(sqlSource).toContain("remaining_fixture_count");
    expect(`${mainSource}\n${planSource}`).not.toContain("enable_seqscan");
    expect(planSource).toContain("explain (analyze, buffers, format text)");
    expect(mainSource).toContain("remaining_explain_fixture_count");
    expect(mainSource).toContain("purchaseOrderConflict");
    expect(mainSource).toContain(
      "SUPPLIER_PURCHASE_REQUISITION_ALREADY_CONVERTED",
    );
    for (const key of Object.keys(passingSummary)) {
      expect(mainSource).not.toMatch(new RegExp(`${key}:\\s*true`));
    }
  });
});
