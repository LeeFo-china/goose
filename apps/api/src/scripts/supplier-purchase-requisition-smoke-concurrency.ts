import type { SmokeSql } from "./supplier-purchase-order-smoke-fixture";
import {
  cleanupConcurrentBudgetResources,
  readBackendPid,
  waitForBudgetAdvisoryLock,
  waitForFirstSubmission,
  waitForOperationCompletion,
  waitForSavedBackendPid,
} from "./supplier-purchase-requisition-smoke-budget-lock";
import {
  commitmentEvidence,
  countConcurrentFixtureRows,
  saveRequisition,
  submitRequisition,
} from "./supplier-purchase-requisition-smoke-sql";
import type {
  assertRequisitionCommandResult,
  runWithForcedRollback,
} from "./supplier-purchase-requisition-smoke";
import {
  findConcurrentFixture,
  seedConcurrentSupplier,
  supplierIds,
  type ConcurrentIds,
} from "./supplier-purchase-requisition-smoke-concurrency-fixture";

type BudgetEvidenceSide = {
  requisition: Record<string, unknown>;
  commitments: Array<{
    status: string;
    amount: string;
    available_amount_snapshot: string;
  }>;
};

type ConcurrentBudgetEvidence = { a: BudgetEvidenceSide; b: BudgetEvidenceSide };
type SubmittedBudgetEvidence = {
  commandResult: Record<string, unknown>; evidence: BudgetEvidenceSide;
};

class SupplierPurchaseRequisitionConcurrencyError extends Error {}

function cents(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      `${label} must be a monetary string`,
    );
  }
  return Math.round(Number(value) * 100);
}

function assertAffordableReservedSide(side: BudgetEvidenceSide, label: string) {
  if (side.requisition.budget_status !== "within_budget") {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      `${label} budget_status must be within_budget`,
    );
  }
  if (side.commitments.length === 0 ||
    side.commitments.some(({ status }) => status !== "reserved")) {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      `${label} commitments must be reserved`,
    );
  }
  const total = cents(side.requisition.total_amount, `${label} total`);
  const reserved = side.commitments.reduce(
    (sum, commitment) => sum + cents(commitment.amount, `${label} amount`),
    0,
  );
  const available = side.commitments.reduce(
    (sum, commitment) =>
      sum + cents(
        commitment.available_amount_snapshot,
        `${label} available`,
      ),
    0,
  );
  if (reserved !== total || total > available) {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      `${label} must be individually affordable and fully reserved`,
    );
  }
  return { total, available };
}

export function assertConcurrentBudgetEvidence(
  evidence: ConcurrentBudgetEvidence,
) {
  if (evidence.a.requisition.supplier_id ===
    evidence.b.requisition.supplier_id) {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      "concurrent submissions must use distinct suppliers",
    );
  }
  const a = assertAffordableReservedSide(evidence.a, "A");
  const b = assertAffordableReservedSide(evidence.b, "B");
  if (a.total + b.total <= Math.min(a.available, b.available)) {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      "combined submissions must exceed the shared available budget",
    );
  }
  return true;
}

export async function runConcurrentBudgetSmoke(
  databaseUrl: string,
  ids: ConcurrentIds,
  rollback: typeof runWithForcedRollback,
  assertSubmitted: typeof assertRequisitionCommandResult,
) {
  const lookup = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const databaseA = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const databaseB = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  let releaseA: (() => void) | undefined;
  let activeOperationA: Promise<SubmittedBudgetEvidence> | undefined;
  let activeOperationB: Promise<SubmittedBudgetEvidence> | undefined;
  let primaryFailure: unknown;
  try {
    const base = await findConcurrentFixture(lookup as SmokeSql);
    let markASubmitted!: () => void;
    let markBSaved!: (pid: number) => void;
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const aSubmitted = new Promise<void>((resolve) => {
      markASubmitted = resolve;
    });
    const bSaved = new Promise<number>((resolve) => {
      markBSaved = resolve;
    });
    const operationA = activeOperationA = rollback(
      databaseA,
      async (transaction) => {
        const sql = transaction as SmokeSql;
        const fixture = await seedConcurrentSupplier(
          sql,
          base,
          supplierIds(ids, "A"),
          "A",
        );
        assertSubmitted(
          await saveRequisition(
            sql,
            fixture,
            ids.concurrentA,
            0,
            "requisition-smoke-concurrent-a",
            1,
          ),
          { status: "saved", idempotent: false, version: 1 },
        );
        const submitted = assertSubmitted(
          await submitRequisition(
            sql,
            fixture,
            ids.concurrentA,
            1,
            "requisition-smoke-concurrent-a-submit",
          ),
          { status: "submitted", idempotent: false, version: 2 },
        );
        const commitments = await commitmentEvidence(
          sql,
          fixture.tenant_id,
          ids.concurrentA,
        );
        markASubmitted();
        await holdA;
        return {
          commandResult: submitted,
          evidence: { requisition: submitted.requisition, commitments },
        };
      },
    );
    const aReady = await waitForFirstSubmission(aSubmitted, operationA);
    if (aReady !== "submitted") {
      throw new SupplierPurchaseRequisitionConcurrencyError(
        `SMOKE_CONCURRENT_A_${aReady.toUpperCase()}`,
      );
    }
    const operationB = activeOperationB = rollback(
      databaseB,
      async (transaction) => {
        const sql = transaction as SmokeSql;
        const fixture = await seedConcurrentSupplier(
          sql,
          base,
          supplierIds(ids, "B"),
          "B",
        );
        assertSubmitted(
          await saveRequisition(
            sql,
            fixture,
            ids.concurrentB,
            0,
            "requisition-smoke-concurrent-b",
            1,
          ),
          { status: "saved", idempotent: false, version: 1 },
        );
        markBSaved(await readBackendPid(sql));
        const submitted = assertSubmitted(
          await submitRequisition(
            sql,
            fixture,
            ids.concurrentB,
            1,
            "requisition-smoke-concurrent-b-submit",
          ),
          { status: "submitted", idempotent: false, version: 2 },
        );
        return {
          commandResult: submitted,
          evidence: {
            requisition: submitted.requisition,
            commitments: await commitmentEvidence(
              sql,
              fixture.tenant_id,
              ids.concurrentB,
            ),
          },
        };
      },
    );
    const bPid = await waitForSavedBackendPid(bSaved, operationB);
    await waitForBudgetAdvisoryLock(lookup as SmokeSql, {
      pid: bPid,
      tenantId: base.tenant_id,
      projectId: base.project_id,
    });
    releaseA?.();
    const bResult = await waitForOperationCompletion(operationB);
    assertSubmitted(bResult.commandResult, {
      status: "submitted",
      idempotent: false,
      version: 2,
    });
    const aResult = await operationA;
    const remainingFixtureCount = await countConcurrentFixtureRows(
      lookup as SmokeSql,
      ids,
    );
    if (remainingFixtureCount !== 0) {
      throw new SupplierPurchaseRequisitionConcurrencyError(
        "SMOKE_CONCURRENT_FIXTURE_NOT_ROLLED_BACK",
      );
    }
    return assertConcurrentBudgetEvidence({
      a: aResult.evidence,
      b: bResult.evidence,
    });
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    releaseA?.();
    await cleanupConcurrentBudgetResources({
      operations: [activeOperationA, activeOperationB],
      connections: [lookup, databaseA, databaseB],
      primaryFailure,
    });
  }
}
