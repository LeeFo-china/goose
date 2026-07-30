import type { SmokeSql } from "./supplier-purchase-order-smoke-fixture";

export type BudgetAdvisoryLockEvidence = {
  pid: number;
  wait_event_type: string | null;
  wait_event: string | null;
  locktype: string | null;
  granted: boolean | null;
  objsubid: number | null;
};

type PollingOptions = {
  maxAttempts?: number;
  retryIntervalMilliseconds?: number;
  waitForRetry?: (milliseconds: number) => Promise<void>;
};

type BudgetLockTarget = {
  pid: number;
  tenantId: string;
  projectId: string;
};

class BudgetAdvisoryLockEvidenceError extends Error {}

function isWaitingForBudgetAdvisoryLock(
  evidence: BudgetAdvisoryLockEvidence | undefined,
): evidence is BudgetAdvisoryLockEvidence {
  return evidence?.wait_event_type === "Lock" &&
    evidence.wait_event === "advisory" &&
    evidence.locktype === "advisory" &&
    evidence.granted === false &&
    evidence.objsubid === 1;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function pollForBudgetAdvisoryLock(
  probe: () => Promise<BudgetAdvisoryLockEvidence | undefined>,
  options: PollingOptions = {},
) {
  const maxAttempts = options.maxAttempts ?? 200;
  const retryIntervalMilliseconds =
    options.retryIntervalMilliseconds ?? 25;
  const waitForRetry = options.waitForRetry ?? delay;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new BudgetAdvisoryLockEvidenceError(
      "budget advisory lock maxAttempts must be a positive integer",
    );
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const evidence = await probe();
    if (isWaitingForBudgetAdvisoryLock(evidence)) return evidence;
    if (attempt < maxAttempts) {
      await waitForRetry(retryIntervalMilliseconds);
    }
  }
  throw new BudgetAdvisoryLockEvidenceError(
    "second backend did not expose the expected waiting budget advisory lock",
  );
}

export async function waitForBudgetAdvisoryLock(
  sql: SmokeSql,
  target: BudgetLockTarget,
  options?: PollingOptions,
) {
  return pollForBudgetAdvisoryLock(async () => {
    const rows = await sql<BudgetAdvisoryLockEvidence[]>`
      with expected_lock as (
        select pg_catalog.hashtextextended(
          'supplier-project-budget:' || ${target.tenantId}::text || ':' ||
            ${target.projectId}::text,
          6720240730150000
        ) as lock_key
      )
      select activity.pid, activity.wait_event_type, activity.wait_event,
        requested.locktype, requested.granted, requested.objsubid
      from pg_catalog.pg_stat_activity as activity
      join pg_catalog.pg_locks as requested
        on requested.pid = activity.pid
      cross join expected_lock
      where activity.pid = ${target.pid}::integer
        and activity.wait_event_type = 'Lock'
        and activity.wait_event = 'advisory'
        and requested.locktype = 'advisory'
        and requested.granted = false
        and requested.objsubid = 1
        and (
          (requested.classid::bigint << 32) |
            requested.objid::bigint
        ) = expected_lock.lock_key
      limit 1;
    `;
    return rows[0];
  }, options);
}

export async function readBackendPid(sql: SmokeSql) {
  const rows = await sql<{ pid: number }[]>`
    select pg_catalog.pg_backend_pid()::integer as pid;
  `;
  const pid = rows[0]?.pid;
  if (typeof pid !== "number" || !Number.isInteger(pid)) {
    throw new BudgetAdvisoryLockEvidenceError(
      "second budget backend PID is missing",
    );
  }
  return pid;
}

export async function waitForSavedBackendPid<T>(
  saved: Promise<number>,
  operation: Promise<T>,
  timeoutMilliseconds = 5_000,
) {
  const ready = await Promise.race([
    saved.then((pid) => ({ kind: "saved" as const, pid })),
    operation.then(() => ({ kind: "settled" as const })),
    new Promise<{ kind: "timeout" }>((resolve) => {
      setTimeout(() => resolve({ kind: "timeout" }), timeoutMilliseconds);
    }),
  ]);
  if (ready.kind !== "saved") {
    throw new BudgetAdvisoryLockEvidenceError(
      `second budget backend ${ready.kind} before PID capture`,
    );
  }
  return ready.pid;
}

export async function waitForOperationCompletion<T>(
  operation: Promise<T>,
  timeoutMilliseconds = 5_000,
) {
  const completed = await Promise.race([
    operation.then((value) => ({ kind: "completed" as const, value })),
    new Promise<{ kind: "timeout" }>((resolve) => {
      setTimeout(() => resolve({ kind: "timeout" }), timeoutMilliseconds);
    }),
  ]);
  if (completed.kind !== "completed") {
    throw new BudgetAdvisoryLockEvidenceError(
      "second budget operation did not complete after lock release",
    );
  }
  return completed.value;
}
