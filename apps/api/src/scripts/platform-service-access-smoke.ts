import {
  cleanupAccessSmokeFixture,
  closeSmokeRefund,
  confirmSmokeRefund,
  createAccessSmokeFixture,
  createApprovedSmokeRefund,
  createPaidSmokeOrder,
  decideSmokeAcceptance,
  isStableProviderConflict,
  prepareSmokeAcceptance,
  readSmokeAccessMode,
  refundSmokeOrder,
  type SmokeFixture,
  type SmokeJson,
  verifyPaidOnboarding,
  verifyRenewalExtension,
} from "./platform-service-access-smoke-fixture";
import {
  verifyProviderClosedConstraint,
  verifyRefundActorFactsStayFrozen,
  verifyRefundOperatorLockOrder,
  verifyTerminatedAcceptanceGuard,
} from "./platform-service-access-smoke-boundaries";

type SmokeScenario = (typeof PLATFORM_SERVICE_ACCESS_SMOKE_SCENARIOS)[number];
type SmokeChecks = Record<SmokeScenario, boolean>;
type SmokeCliInput = {
  databaseUrl: string | undefined;
  runSmoke?: (databaseUrl: string) => Promise<PlatformServiceAccessSmokeSummary>;
  writeStdout?: (message: string) => void;
  writeStderr?: (message: string) => void;
};

export const PLATFORM_SERVICE_ACCESS_SMOKE_FAILED =
  "PLATFORM_SERVICE_ACCESS_SMOKE_FAILED";
export const PLATFORM_SERVICE_ACCESS_SMOKE_SCENARIOS = [
  "paid_onboarding",
  "concurrent_acceptance",
  "renewal_extension",
  "acceptance_idempotency",
  "full_refund_termination",
  "hard_block",
  "service_block",
  "provider_closed_constraint",
  "terminated_acceptance_guard",
  "refund_operator_lock_order",
  "closed_terminal",
  "provider_identity_conflict",
  "fixture_cleanup",
] as const;
export type PlatformServiceAccessSmokeSummary = {
  [Name in SmokeScenario]: boolean;
};

const DEFAULT_LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
class SmokeFailure extends Error {}

export function parseLocalPlatformServiceDatabaseUrl(
  input: string | undefined,
): { ok: true; databaseUrl: string } | { ok: false } {
  const databaseUrl = input?.trim() || DEFAULT_LOCAL_DATABASE_URL;
  try {
    const url = new URL(databaseUrl);
    const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (
      !["postgres:", "postgresql:"].includes(url.protocol)
      || !localHost
      || url.port !== "54322"
      || url.pathname !== "/postgres"
      || url.username !== "postgres"
      || url.password !== "postgres"
    ) return { ok: false };
    return { ok: true, databaseUrl };
  } catch {
    return { ok: false };
  }
}

export function requireLocalPlatformServiceDatabaseUrl(input: string): string {
  const parsed = parseLocalPlatformServiceDatabaseUrl(input);
  if (!parsed.ok) {
    throw new SmokeFailure("platform service access smoke requires local database");
  }
  return parsed.databaseUrl;
}

export function buildPlatformServiceAccessSmokeSummary(
  checks: SmokeChecks,
): PlatformServiceAccessSmokeSummary {
  return Object.fromEntries(
    PLATFORM_SERVICE_ACCESS_SMOKE_SCENARIOS.map((name) => [name, checks[name]]),
  ) as PlatformServiceAccessSmokeSummary;
}

export function orderServiceOrdersByAcceptedPeriod<T extends { id: string }>(
  orders: readonly T[],
  periods: readonly { service_order_id: string }[],
): T[] {
  const byId = new Map(orders.map((order) => [order.id, order]));
  const ordered = periods.flatMap((period) => {
    const order = byId.get(period.service_order_id);
    return order ? [order] : [];
  });
  if (ordered.length !== orders.length) {
    throw new SmokeFailure("accepted period binding is incomplete");
  }
  return ordered;
}

type RefundReflowFact = {
  id: string;
  service_order_id: string;
  status: string;
  refund_request_id: string | null;
  starts_at: unknown;
  ends_at: unknown;
  original_starts_at: unknown;
  original_ends_at: unknown;
  was_shifted: boolean;
  starts_at_acceptance: boolean;
  term_matches: boolean;
};
type RefundReflowContract = {
  status: string;
  service_start_at: unknown;
  service_end_at: unknown;
  last_period_id: string | null;
};

export function isBoundRefundReflow(input: {
  refundOrderId: string;
  remainingOrderId: string;
  refundRequestId: string;
  periods: readonly RefundReflowFact[];
  contract: RefundReflowContract | undefined;
}): boolean {
  const voided = input.periods.find(
    (period) => period.service_order_id === input.refundOrderId,
  );
  const remaining = input.periods.find(
    (period) => period.service_order_id === input.remainingOrderId,
  );
  const contract = input.contract;
  return input.periods.length === 2
    && voided?.status === "voided"
    && voided.refund_request_id === input.refundRequestId
    && sameInstant(voided.starts_at, voided.original_starts_at)
    && sameInstant(voided.ends_at, voided.original_ends_at)
    && remaining?.status === "adjusted"
    && remaining.refund_request_id === input.refundRequestId
    && remaining.was_shifted === true
    && remaining.starts_at_acceptance === true
    && remaining.term_matches === true
    && contract?.status === "active"
    && contract.last_period_id === remaining.id
    && sameInstant(contract.service_start_at, remaining.starts_at)
    && sameInstant(contract.service_end_at, remaining.ends_at);
}

function sameInstant(left: unknown, right: unknown): boolean {
  const leftTime = Date.parse(String(left));
  const rightTime = Date.parse(String(right));
  return Number.isFinite(leftTime) && leftTime === rightTime;
}

export async function runPlatformServiceAccessSmoke(
  databaseUrl: string,
): Promise<PlatformServiceAccessSmokeSummary> {
  databaseUrl = requireLocalPlatformServiceDatabaseUrl(databaseUrl);
  const db = new Bun.SQL(databaseUrl, { max: 4, prepare: false });
  const dbA = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const dbB = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  let fixture: SmokeFixture | null = null;
  const checks = Object.fromEntries(
    PLATFORM_SERVICE_ACCESS_SMOKE_SCENARIOS.map((name) => [name, false]),
  ) as SmokeChecks;

  try {
    fixture = await createAccessSmokeFixture(db);
    const first = await createPaidSmokeOrder(db, fixture, 1);
    const second = await createPaidSmokeOrder(db, fixture, 2);
    checks.paid_onboarding = await verifyPaidOnboarding(db, fixture.tenantId);
    const versions = await Promise.all([
      prepareSmokeAcceptance(db, fixture, first),
      prepareSmokeAcceptance(db, fixture, second),
    ]);
    const [firstAcceptance, secondAcceptance] = await Promise.all([
      decideSmokeAcceptance(dbA, fixture, first, versions[0] ?? 0),
      decideSmokeAcceptance(dbB, fixture, second, versions[1] ?? 0),
    ]);
    checks.concurrent_acceptance =
      firstAcceptance.error_code === null && secondAcceptance.error_code === null;
    checks.renewal_extension = await verifyRenewalExtension(db, fixture.tenantId);

    const acceptedPeriodOrder = await db<Array<{ service_order_id: string }>>`
      select period.service_order_id
      from public.tenant_service_contract_periods as period
      join public.tenant_service_orders as service_order
        on service_order.id = period.service_order_id
      where period.tenant_id = ${fixture.tenantId}::uuid
      order by period.accepted_at, service_order.created_at, service_order.order_no;
    `;
    const [refundFirst, refundSecond] = orderServiceOrdersByAcceptedPeriod(
      [first, second], acceptedPeriodOrder,
    );
    if (!refundFirst || !refundSecond) {
      throw new SmokeFailure("accepted period chronology is incomplete");
    }

    const replaySnapshotBefore = await readAcceptanceSnapshot(db, fixture.tenantId);
    const replay = await decideSmokeAcceptance(
      db,
      fixture,
      first,
      versions[0] ?? 0,
    );
    const replaySnapshotAfter = await readAcceptanceSnapshot(db, fixture.tenantId);
    checks.acceptance_idempotency = replay.idempotent === true
      && (replay.contract_period as SmokeJson).id
        === (firstAcceptance.contract_period as SmokeJson).id
      && JSON.stringify(replaySnapshotAfter) === JSON.stringify(replaySnapshotBefore);

    const firstRefundRequestId = await refundSmokeOrder(
      db, fixture, refundFirst, "first",
    );
    const firstRefundFacts = await db<Array<SmokeJson>>`
      select payment_status, service_status, service_access_terminated_at,
        service_access_termination_reason
      from public.tenant_service_orders where id = ${refundFirst.id}::uuid;
    `;
    const periodsAfterFirstRefund = await db<Array<RefundReflowFact>>`
      select id, service_order_id, status, refund_request_id, starts_at, ends_at,
        original_starts_at, original_ends_at,
        starts_at is distinct from original_starts_at
          or ends_at is distinct from original_ends_at as was_shifted,
        starts_at = accepted_at as starts_at_acceptance,
        ends_at = starts_at + make_interval(years => term_years) as term_matches
      from public.tenant_service_contract_periods
      where tenant_id = ${fixture.tenantId}::uuid order by accepted_at;
    `;
    const contractsAfterFirstRefund = await db<Array<RefundReflowContract>>`
      select status, service_start_at, service_end_at, last_period_id
      from public.tenant_service_contracts
      where tenant_id = ${fixture.tenantId}::uuid;
    `;
    checks.full_refund_termination =
      firstRefundFacts[0]?.payment_status === "refunded"
      && firstRefundFacts[0]?.service_status === "canceled"
      && firstRefundFacts[0]?.service_access_terminated_at != null
      && firstRefundFacts[0]?.service_access_termination_reason
        === "full_refund_confirmed"
      && isBoundRefundReflow({
        refundOrderId: refundFirst.id,
        remainingOrderId: refundSecond.id,
        refundRequestId: firstRefundRequestId,
        periods: periodsAfterFirstRefund,
        contract: contractsAfterFirstRefund[0],
      });

    await refundSmokeOrder(db, fixture, refundSecond, "second");
    checks.service_block = await readSmokeAccessMode(db, fixture.tenantId)
      === "service_blocked";
    await db`update public.tenants set status = 'suspended' where id = ${fixture.tenantId}::uuid`;
    checks.hard_block = await readSmokeAccessMode(db, fixture.tenantId)
      === "hard_blocked";
    await db`update public.tenants set status = 'active' where id = ${fixture.tenantId}::uuid`;

    const constraintOrder = await createPaidSmokeOrder(db, fixture, 3);
    const constraintRequestId = await createApprovedSmokeRefund(
      db,
      fixture,
      constraintOrder,
    );
    checks.provider_closed_constraint = await verifyProviderClosedConstraint(
      db,
      fixture,
      constraintRequestId,
    );
    checks.terminated_acceptance_guard = await verifyTerminatedAcceptanceGuard(
      db,
      fixture,
    );

    const lockCloseOrder = await createPaidSmokeOrder(db, fixture, 4);
    const lockCloseRequestId = await createApprovedSmokeRefund(
      db,
      fixture,
      lockCloseOrder,
    );
    const lockConfirmOrder = await createPaidSmokeOrder(db, fixture, 5);
    const lockConfirmRequestId = await createApprovedSmokeRefund(
      db,
      fixture,
      lockConfirmOrder,
    );
    const freezeCloseOrder = await createPaidSmokeOrder(db, fixture, 6);
    const freezeCloseRequestId = await createApprovedSmokeRefund(
      db,
      fixture,
      freezeCloseOrder,
    );
    const freezeConfirmOrder = await createPaidSmokeOrder(db, fixture, 7);
    const freezeConfirmRequestId = await createApprovedSmokeRefund(
      db,
      fixture,
      freezeConfirmOrder,
    );
    checks.refund_operator_lock_order = await verifyRefundOperatorLockOrder(
      databaseUrl,
      fixture,
      [
        { kind: "close", order: lockCloseOrder, requestId: lockCloseRequestId },
        {
          kind: "confirm",
          order: lockConfirmOrder,
          requestId: lockConfirmRequestId,
        },
      ],
    ) && await verifyRefundActorFactsStayFrozen(databaseUrl, fixture, {
      kind: "close",
      order: freezeCloseOrder,
      requestId: freezeCloseRequestId,
    }) && await verifyRefundActorFactsStayFrozen(databaseUrl, fixture, {
      kind: "confirm",
      order: freezeConfirmOrder,
      requestId: freezeConfirmRequestId,
    });

    const closedOrder = await createPaidSmokeOrder(db, fixture, 8);
    const conflictOrder = await createPaidSmokeOrder(db, fixture, 9);
    const closedRequestId = await createApprovedSmokeRefund(db, fixture, closedOrder);
    const closedResult = await closeSmokeRefund(
      db, fixture, closedOrder, closedRequestId, "closed-provider",
    );
    const closedReplay = await closeSmokeRefund(
      db, fixture, closedOrder, closedRequestId, "closed-provider",
    );
    checks.closed_terminal = closedResult.idempotent === false
      && closedReplay.idempotent === true
      && closedReplay.provider_status === "CLOSED"
      && closedReplay.access_terminated === false;

    const conflictRequestId = await createApprovedSmokeRefund(
      db, fixture, conflictOrder,
    );
    try {
      await confirmSmokeRefund(
        db, fixture, conflictOrder, conflictRequestId, "closed-provider",
      );
    } catch (error) {
      checks.provider_identity_conflict = isStableProviderConflict(error);
    }
  } finally {
    await Promise.allSettled([dbA.close(), dbB.close()]);
    try {
      if (fixture) {
        await cleanupAccessSmokeFixture(db, fixture);
        const rows = await db<Array<{ count: number }>>`
          select count(*)::int as count from public.tenants
          where id = ${fixture.tenantId}::uuid;
        `;
        checks.fixture_cleanup = rows[0]?.count === 0;
      }
    } finally {
      await db.close();
    }
  }

  if (!Object.values(checks).every(Boolean)) {
    const failed = PLATFORM_SERVICE_ACCESS_SMOKE_SCENARIOS.filter(
      (name) => !checks[name],
    ).join(",");
    throw new SmokeFailure(`platform service access smoke assertion failed: ${failed}`);
  }
  return buildPlatformServiceAccessSmokeSummary(checks);
}

async function readAcceptanceSnapshot(
  db: InstanceType<typeof Bun.SQL>,
  tenantId: string,
): Promise<SmokeJson | undefined> {
  const rows = await db<Array<SmokeJson>>`
    select contract.id, contract.version, contract.service_start_at,
      contract.service_end_at, contract.last_period_id,
      (select count(*)::int from public.tenant_service_contract_periods period
        where period.tenant_id = contract.tenant_id) as period_count
    from public.tenant_service_contracts contract
    where contract.tenant_id = ${tenantId}::uuid;
  `;
  return rows[0];
}

export async function runPlatformServiceAccessSmokeCli(
  input: SmokeCliInput,
): Promise<0 | 1> {
  const parsed = parseLocalPlatformServiceDatabaseUrl(input.databaseUrl);
  const writeStdout = input.writeStdout ?? console.log;
  const writeStderr = input.writeStderr ?? console.error;
  if (!parsed.ok) {
    writeStderr(PLATFORM_SERVICE_ACCESS_SMOKE_FAILED);
    return 1;
  }
  try {
    const summary = await (input.runSmoke ?? runPlatformServiceAccessSmoke)(
      parsed.databaseUrl,
    );
    writeStdout(JSON.stringify(summary));
    return Object.values(summary).every(Boolean) ? 0 : 1;
  } catch {
    writeStderr(PLATFORM_SERVICE_ACCESS_SMOKE_FAILED);
    return 1;
  }
}

if (import.meta.main) {
  runPlatformServiceAccessSmokeCli({
    databaseUrl: process.env.SUPABASE_DB_DIRECT_URL,
  }).then((code) => {
    process.exitCode = code;
  }).catch(() => {
    console.error(PLATFORM_SERVICE_ACCESS_SMOKE_FAILED);
    process.exitCode = 1;
  });
}
