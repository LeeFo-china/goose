import {
  closeSmokeRefund,
  confirmSmokeRefund,
  createPaidSmokeOrder,
  decideSmokeAcceptance,
  prepareSmokeAcceptance,
  type SmokeFixture,
  type SmokeJson,
  type SmokeOrder,
} from "./platform-service-access-smoke-fixture";

type SqlClient = InstanceType<typeof Bun.SQL>;
type RefundProbe = {
  kind: "close" | "confirm";
  order: SmokeOrder;
  requestId: string;
};

export async function verifyProviderClosedConstraint(
  db: SqlClient,
  fixture: SmokeFixture,
  requestId: string,
): Promise<boolean> {
  const initial = await db<Array<SmokeJson>>`
    select status, provider_refund_status, provider_out_refund_no,
      provider_wechat_refund_id, provider_refund_amount_fen,
      provider_checked_at, provider_checked_by_employee_id
    from public.tenant_service_refund_requests
    where id = ${requestId}::uuid;
  `;
  const allNull = initial[0]?.status === "approved"
    && [
      "provider_refund_status",
      "provider_out_refund_no",
      "provider_wechat_refund_id",
      "provider_refund_amount_fen",
      "provider_checked_at",
      "provider_checked_by_employee_id",
    ].every((field) => initial[0]?.[field] == null);

  const unknownPartialRejected = await rejectsCheckViolation(async () => {
    await db`
      update public.tenant_service_refund_requests set
        status = 'cancelled', provider_refund_status = null,
        provider_out_refund_no = 'task8-partial-out',
        provider_wechat_refund_id = 'task8-partial-wechat',
        provider_refund_amount_fen = ${fixture.amountFen}::bigint,
        provider_checked_at = clock_timestamp(),
        provider_checked_by_employee_id = ${fixture.platformOperatorId}::uuid
      where id = ${requestId}::uuid;
    `;
  });
  const wrongStatusRejected = await rejectsCheckViolation(async () => {
    await db`
      update public.tenant_service_refund_requests set
        status = 'approved', provider_refund_status = 'CLOSED',
        provider_out_refund_no = 'task8-wrong-status-out',
        provider_wechat_refund_id = 'task8-wrong-status-wechat',
        provider_refund_amount_fen = ${fixture.amountFen}::bigint,
        provider_checked_at = clock_timestamp(),
        provider_checked_by_employee_id = ${fixture.platformOperatorId}::uuid
      where id = ${requestId}::uuid;
    `;
  });

  await db`
    update public.tenant_service_refund_requests set
      status = 'cancelled', provider_refund_status = 'CLOSED',
      provider_out_refund_no = 'task8-valid-closed-out',
      provider_wechat_refund_id = 'task8-valid-closed-wechat',
      provider_refund_amount_fen = ${fixture.amountFen}::bigint,
      provider_checked_at = clock_timestamp(),
      provider_checked_by_employee_id = ${fixture.platformOperatorId}::uuid
    where id = ${requestId}::uuid;
  `;
  const terminal = await db<Array<SmokeJson>>`
    select status, provider_refund_status, provider_out_refund_no,
      provider_wechat_refund_id, provider_refund_amount_fen,
      provider_checked_at, provider_checked_by_employee_id
    from public.tenant_service_refund_requests
    where id = ${requestId}::uuid;
  `;
  return allNull
    && unknownPartialRejected
    && wrongStatusRejected
    && terminal[0]?.status === "cancelled"
    && terminal[0]?.provider_refund_status === "CLOSED"
    && terminal[0]?.provider_checked_at != null
    && terminal[0]?.provider_checked_by_employee_id === fixture.platformOperatorId;
}

export async function verifyTerminatedAcceptanceGuard(
  db: SqlClient,
  fixture: SmokeFixture,
): Promise<boolean> {
  const helperOrder = await createPaidSmokeOrder(db, fixture, 51);
  await prepareSmokeAcceptance(db, fixture, helperOrder);
  await terminateOrder(db, fixture, helperOrder);
  const helperBefore = await readAcceptanceCommandSnapshot(db, helperOrder);
  let helperRejected = false;
  try {
    await db`
      select public.tenant_service_ensure_contract_period(
        ${fixture.tenantId}::uuid, ${helperOrder.id}::uuid, clock_timestamp()
      );
    `;
  } catch (error) {
    helperRejected = messageOf(error) === "SERVICE_CONTRACT_ORDER_INVALID_STATE";
  }
  const helperAfter = await readAcceptanceCommandSnapshot(db, helperOrder);

  const customerOrder = await createPaidSmokeOrder(db, fixture, 52);
  const customerVersion = await prepareSmokeAcceptance(db, fixture, customerOrder);
  await terminateOrder(db, fixture, customerOrder);
  const customerBefore = await readAcceptanceCommandSnapshot(db, customerOrder);
  const customerResult = await decideSmokeAcceptance(
    db,
    fixture,
    customerOrder,
    customerVersion,
  );
  const customerAfter = await readAcceptanceCommandSnapshot(db, customerOrder);

  const overdueOrder = await createPaidSmokeOrder(db, fixture, 53);
  const overdueVersion = await prepareSmokeAcceptance(db, fixture, overdueOrder);
  await db`
    update public.tenant_service_acceptance_preparations
    set submitted_at = clock_timestamp() - interval '2 minutes',
      acceptance_due_at = clock_timestamp() - interval '1 minute'
    where service_order_id = ${overdueOrder.id}::uuid;
  `;
  await terminateOrder(db, fixture, overdueOrder);
  const overdueBefore = await readAcceptanceCommandSnapshot(db, overdueOrder);
  const overdueRows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_confirm_overdue_acceptance(
      ${overdueOrder.workOrderId}::uuid, ${overdueVersion},
      ${fixture.platformOperatorId}::uuid, 'Task8 termination guard', '{}'::jsonb
    ) as result;
  `;
  const overdueAfter = await readAcceptanceCommandSnapshot(db, overdueOrder);

  return helperRejected
    && sameSnapshot(helperBefore, helperAfter)
    && customerResult.error_code === "SERVICE_ACCEPTANCE_INVALID_STATE"
    && sameSnapshot(customerBefore, customerAfter)
    && overdueRows[0]?.result.error_code === "SERVICE_ACCEPTANCE_INVALID_STATE"
    && sameSnapshot(overdueBefore, overdueAfter);
}

export async function verifyRefundOperatorLockOrder(
  databaseUrl: string,
  fixture: SmokeFixture,
  probes: readonly RefundProbe[],
): Promise<boolean> {
  for (const probe of probes) {
    if (!await probeRefundOperatorLockOrder(databaseUrl, fixture, probe)) {
      return false;
    }
  }
  return true;
}

export async function verifyRefundActorFactsStayFrozen(
  databaseUrl: string,
  fixture: SmokeFixture,
  probe: RefundProbe,
): Promise<boolean> {
  const rpcDb = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const orderDb = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const observerDb = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  let signalReady!: () => void;
  let releaseOrder!: () => void;
  const ready = new Promise<void>((resolve) => signalReady = resolve);
  const release = new Promise<void>((resolve) => releaseOrder = resolve);
  try {
    const roleRows = await observerDb<Array<{ role_id: string }>>`
      select employee_role.role_id from public.employee_roles employee_role
      join public.roles role on role.id = employee_role.role_id
      where employee_role.employee_id = ${fixture.platformOperatorId}::uuid
        and role.tenant_id is null and role.status = 'active'
      order by employee_role.role_id limit 1;
    `;
    const orderLock = orderDb.begin(async (tx) => {
      await tx`select public.platform_service_lock_order(${probe.order.id}::uuid)`;
      signalReady();
      await release;
    });
    await ready;
    const pidRows = await rpcDb<Array<{ pid: number }>>`
      select pg_backend_pid()::int as pid;
    `;
    const rpc = probe.kind === "close"
      ? closeSmokeRefund(
        rpcDb, fixture, probe.order, probe.requestId, "task8-freeze-close",
      )
      : confirmSmokeRefund(
        rpcDb, fixture, probe.order, probe.requestId, "task8-freeze-confirm",
      );
    const waiting = await waitForBackendLock(observerDb, pidRows[0]!.pid);
    const employeeFrozen = waiting && await rowUpdateLockIsBlocked(
      observerDb,
      "employees",
      fixture.platformOperatorId,
    );
    const employeeRoleFrozen = await relationshipUpdateLockIsBlocked(
      observerDb,
      fixture.platformOperatorId,
      roleRows[0]?.role_id,
    );
    const roleFrozen = await rowUpdateLockIsBlocked(
      observerDb,
      "roles",
      roleRows[0]?.role_id,
    );
    releaseOrder();
    const [rpcResult, orderResult] = await Promise.allSettled([rpc, orderLock]);
    return employeeFrozen && employeeRoleFrozen && roleFrozen
      && rpcResult.status === "fulfilled"
      && orderResult.status === "fulfilled";
  } finally {
    releaseOrder?.();
    await Promise.allSettled([rpcDb.close(), orderDb.close(), observerDb.close()]);
  }
}

async function probeRefundOperatorLockOrder(
  databaseUrl: string,
  fixture: SmokeFixture,
  probe: RefundProbe,
): Promise<boolean> {
  const rpcDb = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const actorDb = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const observerDb = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  let signalReady!: () => void;
  let releaseActor!: () => void;
  const ready = new Promise<void>((resolve) => signalReady = resolve);
  const release = new Promise<void>((resolve) => releaseActor = resolve);
  try {
    const actorLock = actorDb.begin(async (tx) => {
      await tx`
        select id from public.employees
        where id = ${fixture.platformOperatorId}::uuid for update;
      `;
      signalReady();
      await release;
    });
    await ready;
    const pidRows = await rpcDb<Array<{ pid: number }>>`
      select pg_backend_pid()::int as pid;
    `;
    const rpc = probe.kind === "close"
      ? closeSmokeRefund(
        rpcDb, fixture, probe.order, probe.requestId, "task8-lock-close",
      )
      : confirmSmokeRefund(
        rpcDb, fixture, probe.order, probe.requestId, "task8-lock-confirm",
      );
    const waiting = await waitForBackendLock(observerDb, pidRows[0]!.pid);
    const refundStillFree = waiting && await canLockRefundNowait(
      observerDb,
      probe.requestId,
    );
    releaseActor();
    const [rpcResult, actorResult] = await Promise.allSettled([rpc, actorLock]);
    return refundStillFree
      && rpcResult.status === "fulfilled"
      && actorResult.status === "fulfilled";
  } finally {
    releaseActor?.();
    await Promise.allSettled([rpcDb.close(), actorDb.close(), observerDb.close()]);
  }
}

async function waitForBackendLock(db: SqlClient, pid: number): Promise<boolean> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await db<Array<{ wait_event_type: string | null }>>`
      select wait_event_type from pg_stat_activity where pid = ${pid}::int;
    `;
    if (rows[0]?.wait_event_type === "Lock") return true;
    await Bun.sleep(10);
  }
  return false;
}

async function canLockRefundNowait(
  db: SqlClient,
  refundRequestId: string,
): Promise<boolean> {
  try {
    await db.begin(async (tx) => {
      await tx`
        select id from public.tenant_service_refund_requests
        where id = ${refundRequestId}::uuid for update nowait;
      `;
    });
    return true;
  } catch {
    return false;
  }
}

async function rowUpdateLockIsBlocked(
  db: SqlClient,
  table: "employees" | "roles",
  id: string | undefined,
): Promise<boolean> {
  if (!id) return false;
  try {
    if (table === "employees") {
      await db.begin(async (tx) => {
        await tx`select id from public.employees where id = ${id}::uuid for update nowait`;
      });
    } else {
      await db.begin(async (tx) => {
        await tx`select id from public.roles where id = ${id}::uuid for update nowait`;
      });
    }
    return false;
  } catch (error) {
    return databaseCode(error) === "55P03";
  }
}

async function relationshipUpdateLockIsBlocked(
  db: SqlClient,
  employeeId: string,
  roleId: string | undefined,
): Promise<boolean> {
  if (!roleId) return false;
  try {
    await db.begin(async (tx) => {
      await tx`
        select role_id from public.employee_roles
        where employee_id = ${employeeId}::uuid and role_id = ${roleId}::uuid
        for update nowait;
      `;
    });
    return false;
  } catch (error) {
    return databaseCode(error) === "55P03";
  }
}

async function terminateOrder(
  db: SqlClient,
  fixture: SmokeFixture,
  order: SmokeOrder,
): Promise<void> {
  await db`
    update public.tenant_service_orders set
      service_access_terminated_at = clock_timestamp(),
      service_access_termination_reason = 'task8_controlled_termination',
      service_access_terminated_by_employee_id = ${fixture.employeeId}::uuid
    where id = ${order.id}::uuid;
  `;
}

async function readAcceptanceCommandSnapshot(
  db: SqlClient,
  order: SmokeOrder,
): Promise<SmokeJson> {
  const rows = await db<Array<SmokeJson>>`
    select service_order.service_status, service_order.version as order_version,
      work_order.status as work_status, work_order.version as work_version,
      acceptance.status as acceptance_status,
      (select count(*)::int from public.tenant_service_contract_periods period
        where period.service_order_id = service_order.id) as period_count,
      (select count(*)::int from public.tenant_service_contracts contract
        where contract.tenant_id = service_order.tenant_id) as contract_count,
      (select count(*)::int from public.tenant_service_work_order_events event
        where event.service_order_id = service_order.id) as event_count
    from public.tenant_service_orders service_order
    join public.tenant_service_work_orders work_order
      on work_order.service_order_id = service_order.id
    join public.tenant_service_acceptance_preparations acceptance
      on acceptance.service_order_id = service_order.id
    where service_order.id = ${order.id}::uuid;
  `;
  return rows[0] ?? {};
}

async function rejectsCheckViolation(operation: () => Promise<void>): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch (error) {
    return databaseCode(error) === "23514";
  }
}

function databaseCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "errno" in error
    ? String(error.errno)
    : undefined;
}

function messageOf(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function sameSnapshot(left: SmokeJson, right: SmokeJson): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
