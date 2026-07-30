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

export type TimeoutScheduler = {
  set(callback: () => void, milliseconds: number): unknown;
  clear(token: unknown): void;
};

type ClosableSql = {
  close(options?: { timeout?: number }): Promise<void>;
};

type CleanupInput = {
  operations: Array<Promise<unknown> | undefined>;
  connections: ClosableSql[];
  primaryFailure?: unknown;
  operationTimeoutMilliseconds?: number;
  closeWaitMilliseconds?: number;
  closeTimeoutSeconds?: number;
  scheduler?: TimeoutScheduler;
};

const systemTimeoutScheduler: TimeoutScheduler = {
  set: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: (token) => clearTimeout(token as ReturnType<typeof setTimeout>),
};

export async function awaitBeforeTimeout<Result>(
  operation: Promise<Result>,
  timeoutMilliseconds: number,
  timeoutMessage: string,
  scheduler: TimeoutScheduler = systemTimeoutScheduler,
) {
  let timeoutToken: unknown;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutToken = scheduler.set(() => {
      reject(new BudgetAdvisoryLockEvidenceError(timeoutMessage));
    }, timeoutMilliseconds);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    scheduler.clear(timeoutToken);
  }
}

function firstRejected(
  results: PromiseSettledResult<unknown>[],
): unknown {
  return results.find((result) => result.status === "rejected")?.reason;
}

export async function cleanupConcurrentBudgetResources(
  input: CleanupInput,
) {
  const scheduler = input.scheduler ?? systemTimeoutScheduler;
  const operations = input.operations.filter(
    (operation): operation is Promise<unknown> => operation !== undefined,
  );
  let cleanupFailure: unknown;
  try {
    const settled = await awaitBeforeTimeout(
      Promise.allSettled(operations),
      input.operationTimeoutMilliseconds ?? 5_000,
      "concurrent budget operations did not settle during cleanup",
      scheduler,
    );
    cleanupFailure = firstRejected(settled);
  } catch (error) {
    cleanupFailure = error;
  }
  const closeOperations = input.connections.map(async (connection) => {
    await connection.close({ timeout: input.closeTimeoutSeconds ?? 1 });
  });
  try {
    const closed = await awaitBeforeTimeout(
      Promise.allSettled(closeOperations),
      input.closeWaitMilliseconds ?? 2_000,
      "concurrent budget connections did not close in time",
      scheduler,
    );
    cleanupFailure ??= firstRejected(closed);
  } catch (error) {
    cleanupFailure ??= error;
  }
  if (input.primaryFailure !== undefined) throw input.primaryFailure;
  if (cleanupFailure !== undefined) throw cleanupFailure;
}

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
  scheduler: TimeoutScheduler = systemTimeoutScheduler,
) {
  const ready = await awaitBeforeTimeout(
    Promise.race([
      saved.then((pid) => ({ kind: "saved" as const, pid })),
      operation.then(() => ({ kind: "settled" as const })),
    ]),
    timeoutMilliseconds,
    "second budget backend timed out before PID capture",
    scheduler,
  );
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
  scheduler: TimeoutScheduler = systemTimeoutScheduler,
) {
  return awaitBeforeTimeout(
    operation,
    timeoutMilliseconds,
    "second budget operation did not complete after lock release",
    scheduler,
  );
}

export async function waitForFirstSubmission<T>(
  submitted: Promise<void>,
  operation: Promise<T>,
) {
  return awaitBeforeTimeout(
    Promise.race([
      submitted.then(() => "submitted" as const),
      operation.then(() => "settled" as const),
    ]),
    5_000,
    "SMOKE_CONCURRENT_A_TIMEOUT",
  );
}
