import type { TransactionSQL } from "bun";

import {
  SupplierPaymentSmokeAssertionError,
  savePaymentRequest,
  submitPaymentRequest,
  type SupplierPaymentRequestActorFixture,
} from "./supplier-payment-smoke-commands";
import type { SupplierPaymentSmokeSql } from
  "./supplier-payment-smoke-fixture";
import {
  closeThenCheckFreshResidual,
  type SupplierPaymentFailureState,
} from "./supplier-payment-smoke-residual";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export const SUPPLIER_PAYMENT_CONCURRENCY_IDS = {
  requestA: "87000000-0000-4000-8000-000000000002",
  requestB: "87000000-0000-4000-8000-000000000003",
  saveA: "87000000-0000-4000-8000-000000000004",
  saveB: "87000000-0000-4000-8000-000000000005",
  submitA: "87000000-0000-4000-8000-000000000006",
  submitB: "87000000-0000-4000-8000-000000000007",
} as const;

type ConcurrentClient<Transaction> = {
  clientId: "A" | "B";
  begin<Result>(
    callback: (transaction: Transaction) => Promise<Result>,
  ): Promise<Result>;
};

type ConcurrentPayableFixture = SupplierPaymentRequestActorFixture & {
  payable_id: string;
  supplier_id: string;
  available_amount: string;
  currency: string;
};

type Deferred<Value> = {
  promise: Promise<Value>;
  resolve(value: Value): void;
};

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function prerequisite(message: string): never {
  throw new SupplierPaymentSmokeAssertionError(
    `SUPPLIER_PAYMENT_SMOKE_PREREQUISITE_CONCURRENCY_${message}`,
  );
}

export function assertCommittedConcurrencyConfig(input: {
  databaseUrl: string;
  allowCommittedConcurrency?: string;
  disposableDatabase?: string;
  payableId?: string;
}): { payableId: string } {
  if (input.allowCommittedConcurrency !== "1") {
    prerequisite("ALLOW_COMMITTED_CONCURRENCY_REQUIRED");
  }
  if (input.disposableDatabase !== "1") {
    prerequisite("DISPOSABLE_DATABASE_REQUIRED");
  }
  let hostname: string;
  try {
    hostname = new URL(input.databaseUrl).hostname;
  } catch {
    prerequisite("DATABASE_URL_INVALID");
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname!)) {
    prerequisite("LOOPBACK_DATABASE_REQUIRED");
  }
  if (!input.payableId || !UUID_PATTERN.test(input.payableId)) {
    prerequisite("CONCURRENCY_PAYABLE_ID_REQUIRED");
  }
  return { payableId: input.payableId };
}

async function waitForSignal<Value>(
  signal: Promise<Value>,
  operation: Promise<unknown>,
  label: string,
): Promise<Value> {
  return Promise.race([
    signal,
    operation.then(
      () => prerequisite(`${label}_COMPLETED_BEFORE_BARRIER`),
      (error) => {
        throw error;
      },
    ),
  ]);
}

export async function runConcurrentSubmitOverlap<Transaction, Result>(input: {
  clients: readonly [
    ConcurrentClient<Transaction>,
    ConcurrentClient<Transaction>,
  ];
  submit(
    clientId: "A" | "B",
    transaction: Transaction,
  ): Promise<Result>;
  waitForSecondBlocked(): Promise<void>;
}): Promise<readonly [Result, Result]> {
  const [clientA, clientB] = input.clients;
  if (clientA === clientB || clientA.clientId === clientB.clientId) {
    prerequisite("DISTINCT_CLIENTS_REQUIRED");
  }
  const firstSubmitted = deferred<void>();
  const releaseFirst = deferred<void>();
  const secondStarted = deferred<void>();
  let operationA: Promise<Result> | undefined;
  let operationB: Promise<Result> | undefined;
  try {
    operationA = clientA.begin(async (transaction) => {
      const result = await input.submit("A", transaction);
      firstSubmitted.resolve();
      await releaseFirst.promise;
      return result;
    });
    await waitForSignal(firstSubmitted.promise, operationA, "FIRST_SUBMIT");
    operationB = clientB.begin(async (transaction) => {
      secondStarted.resolve();
      return input.submit("B", transaction);
    });
    await waitForSignal(secondStarted.promise, operationB, "SECOND_SUBMIT");
    await input.waitForSecondBlocked();
    releaseFirst.resolve();
    return await Promise.all([operationA, operationB]);
  } finally {
    releaseFirst.resolve();
    await Promise.allSettled(
      [operationA, operationB].filter(
        (operation): operation is Promise<Result> => operation !== undefined,
      ),
    );
  }
}

async function cleanupConcurrentRequests(
  database: Bun.SQL,
): Promise<void> {
  await database.begin(async (transaction) => {
    await transaction`select set_config(
      'app.supplier_payment_command', 'on', true
    );`;
    await transaction`
      delete from public.supplier_payment_request_allocations
      where payment_request_id in (
        ${SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestA}::uuid,
        ${SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestB}::uuid
      );
    `;
    await transaction`
      delete from public.supplier_payment_requests
      where id in (
        ${SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestA}::uuid,
        ${SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestB}::uuid
      );
    `;
    await transaction`
      delete from public.supplier_command_events
      where resource_type = 'supplier_payment_request'
        and resource_id in (
          ${SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestA}::uuid,
          ${SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestB}::uuid
        );
    `;
  });
}

async function countConcurrentResiduals(database: Bun.SQL): Promise<number> {
  const rows = await database<{ count: number }[]>`
    select sum(fact.count)::integer as count
    from (
      select count(*) from public.supplier_payment_request_allocations
      where payment_request_id in (
        ${SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestA}::uuid,
        ${SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestB}::uuid
      )
      union all
      select count(*) from public.supplier_payment_requests
      where id in (
        ${SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestA}::uuid,
        ${SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestB}::uuid
      )
      union all
      select count(*) from public.supplier_command_events
      where resource_type = 'supplier_payment_request'
        and resource_id in (
          ${SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestA}::uuid,
          ${SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestB}::uuid
        )
    ) as fact;
  `;
  return rows[0]?.count ?? -1;
}

async function readConcurrentPayable(
  database: Bun.SQL,
  payableId: string,
): Promise<ConcurrentPayableFixture> {
  const rows = await database<ConcurrentPayableFixture[]>`
    select payable.id as payable_id, payable.tenant_id,
      payable.project_id, payable.tenant_supplier_id as relationship_id,
      payable.supplier_id, payable.currency,
      (
        payable.amount -
        coalesce(paid.amount, 0) -
        coalesce(reserved.amount, 0)
      )::numeric(18, 2)::text as available_amount,
      employee.user_id, employee.id as employee_id
    from public.supplier_payable_events as payable
    join public.employees as employee
      on employee.id = payable.created_by_employee_id
      and employee.tenant_id = payable.tenant_id
      and employee.status = 'active'
      and employee.user_id is not null
    left join lateral (
      select sum(allocation.amount) as amount
      from public.supplier_payment_allocations as allocation
      where allocation.tenant_id = payable.tenant_id
        and allocation.payable_event_id = payable.id
    ) as paid on true
    left join lateral (
      select sum(
        allocation.requested_amount - allocation.paid_amount
      ) as amount
      from public.supplier_payment_request_allocations as allocation
      join public.supplier_payment_requests as request
        on request.id = allocation.payment_request_id
        and request.tenant_id = allocation.tenant_id
      where allocation.tenant_id = payable.tenant_id
        and allocation.payable_event_id = payable.id
        and request.status in (
          'pending_approval', 'approved', 'partially_paid'
        )
    ) as reserved on true
    where payable.id = ${payableId}::uuid;
  `;
  const fixture = rows[0];
  if (
    rows.length !== 1 || !fixture ||
    fixture.payable_id !== payableId ||
    ![
      fixture.tenant_id,
      fixture.project_id,
      fixture.relationship_id,
      fixture.supplier_id,
      fixture.user_id,
      fixture.employee_id,
    ].every((value) => UUID_PATTERN.test(value)) ||
    fixture.currency !== "CNY" ||
    !/^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(fixture.available_amount) ||
    Number(fixture.available_amount) <= 0
  ) {
    prerequisite("EXPLICIT_PAYABLE_UNAVAILABLE");
  }
  return fixture;
}

async function seedConcurrentDrafts(
  database: Bun.SQL,
  fixture: ConcurrentPayableFixture,
): Promise<void> {
  const allocations = [{
    payable_event_id: fixture.payable_id,
    requested_amount: fixture.available_amount,
  }];
  await database.begin(async (transaction) => {
    const sql = transaction as unknown as SupplierPaymentSmokeSql;
    const a = await savePaymentRequest(sql, fixture, {
      requestId: SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestA,
      expectedVersion: 0,
      idempotencyKey: SUPPLIER_PAYMENT_CONCURRENCY_IDS.saveA,
      allocations,
    });
    const b = await savePaymentRequest(sql, fixture, {
      requestId: SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestB,
      expectedVersion: 0,
      idempotencyKey: SUPPLIER_PAYMENT_CONCURRENCY_IDS.saveB,
      allocations,
    });
    if (a.status !== "saved" || b.status !== "saved") {
      prerequisite("DRAFT_SETUP_FAILED");
    }
  });
}

async function readBackendPid(sql: SupplierPaymentSmokeSql): Promise<number> {
  const rows = await sql<{ pid: number }[]>`
    select pg_backend_pid()::integer as pid;
  `;
  const pid = rows[0]?.pid;
  if (!Number.isInteger(pid) || pid! <= 0) prerequisite("BACKEND_PID_MISSING");
  return pid!;
}

async function waitForBlockedSubmit(
  lookup: Bun.SQL,
  backendPid: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await lookup<{ waiting: boolean }[]>`
      select exists (
        select 1
        from pg_catalog.pg_stat_activity as activity
        where activity.pid = ${backendPid}::integer
          and activity.wait_event_type = 'Lock'
          and activity.query like '%submit_supplier_payment_request%'
          and exists (
            select 1
            from pg_catalog.pg_locks as waiting_lock
            where waiting_lock.pid = activity.pid
              and not waiting_lock.granted
          )
      ) as waiting;
    `;
    if (rows[0]?.waiting === true) return;
  }
  prerequisite("SECOND_SUBMIT_LOCK_NOT_OBSERVED");
}

function captureFailure(
  current: SupplierPaymentFailureState,
  value: unknown,
): SupplierPaymentFailureState {
  return current.failed ? current : { failed: true, value };
}

async function closeAndCapture(
  database: Bun.SQL,
  failure: SupplierPaymentFailureState,
): Promise<SupplierPaymentFailureState> {
  try {
    await database.close();
    return failure;
  } catch (error) {
    return captureFailure(failure, error);
  }
}

export async function runConcurrentRequestProbe(
  databaseUrl: string,
  config: {
    allowCommittedConcurrency?: string;
    disposableDatabase?: string;
    payableId?: string;
  },
): Promise<true> {
  const validated = assertCommittedConcurrencyConfig({
    databaseUrl,
    ...config,
  });
  const control = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const databaseA = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const databaseB = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  let failure: SupplierPaymentFailureState = { failed: false };
  let passed = false;
  try {
    try {
      await cleanupConcurrentRequests(control);
    } catch {
      prerequisite("DEDICATED_IDS_CLEANUP_FAILED");
    }
    if (await countConcurrentResiduals(control) !== 0) {
      prerequisite("DEDICATED_IDS_CONFLICT");
    }
    const fixture = await readConcurrentPayable(control, validated.payableId);
    await seedConcurrentDrafts(control, fixture);
    const backendB = deferred<number>();
    const results = await runConcurrentSubmitOverlap({
      clients: [
        {
          clientId: "A",
          begin: (callback) => databaseA.begin(callback),
        },
        {
          clientId: "B",
          begin: (callback) => databaseB.begin(callback),
        },
      ],
      async submit(clientId, transaction) {
        const sql = transaction as unknown as SupplierPaymentSmokeSql;
        if (clientId === "B") backendB.resolve(await readBackendPid(sql));
        return submitPaymentRequest(sql, fixture, {
          requestId: clientId === "A"
            ? SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestA
            : SUPPLIER_PAYMENT_CONCURRENCY_IDS.requestB,
          expectedVersion: 1,
          idempotencyKey: clientId === "A"
            ? SUPPLIER_PAYMENT_CONCURRENCY_IDS.submitA
            : SUPPLIER_PAYMENT_CONCURRENCY_IDS.submitB,
        });
      },
      async waitForSecondBlocked() {
        await waitForBlockedSubmit(control, await backendB.promise);
      },
    });
    if (
      results[0].status !== "submitted" ||
      results[1].status !== "amount_unavailable"
    ) {
      throw new SupplierPaymentSmokeAssertionError(
        "concurrent requests must produce one committed submitted winner",
      );
    }
    passed = true;
  } catch (error) {
    failure = { failed: true, value: error };
  }

  failure = await closeAndCapture(databaseB, failure);
  failure = await closeAndCapture(databaseA, failure);
  try {
    await cleanupConcurrentRequests(control);
  } catch (error) {
    failure = captureFailure(failure, error);
  }
  await closeThenCheckFreshResidual({
    original: control,
    createFresh: () =>
      new Bun.SQL(databaseUrl, { max: 1, prepare: false }),
    countResidual: countConcurrentResiduals,
    primaryFailure: failure,
    label: "supplier payment committed concurrency",
  });
  if (!passed) {
    throw new SupplierPaymentSmokeAssertionError(
      "supplier payment concurrent request probe did not complete",
    );
  }
  return true;
}
