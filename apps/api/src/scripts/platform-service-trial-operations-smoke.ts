import {
  cleanupPlatformServiceTrialFixture,
  createPlatformServiceTrialFixture,
  type PlatformServiceTrialFixture,
  type SmokeJson,
  type TrialSql,
} from "./platform-service-trial-smoke-fixture";
import {
  parseLocalPlatformServiceTrialDatabaseUrl,
  withIsolatedPlatformServiceTrialEnvironment,
} from "./platform-service-trial-smoke";

export const PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_FAILED =
  "PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_FAILED";
export const PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_SCENARIOS = [
  "time_boundary_once",
  "failed_delivery_retry",
  "follow_up_pagination",
  "fixture_cleanup",
] as const;

type Scenario = (typeof PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_SCENARIOS)[number];
type Checks = Record<Scenario, boolean>;
export type TrialOperationsSmokeSummary = { [Name in Scenario]: boolean };
type CliInput = {
  databaseUrl: string | undefined;
  runSmoke?: (databaseUrl: string) => Promise<TrialOperationsSmokeSummary>;
  writeStdout?: (message: string) => void;
  writeStderr?: (message: string) => void;
};

class RollbackSmokeTransaction extends Error {}
class TrialOperationsSmokeFailure extends Error {}

export const parseLocalTrialOperationsDatabaseUrl =
  parseLocalPlatformServiceTrialDatabaseUrl;

export function buildTrialOperationsSmokeSummary(
  checks: Checks,
): TrialOperationsSmokeSummary {
  return Object.fromEntries(
    PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_SCENARIOS.map(
      (name) => [name, checks[name]],
    ),
  ) as TrialOperationsSmokeSummary;
}

export async function runPlatformServiceTrialOperationsSmoke(
  databaseUrl: string,
): Promise<TrialOperationsSmokeSummary> {
  const parsed = parseLocalTrialOperationsDatabaseUrl(databaseUrl);
  if (!parsed.ok) throw new TrialOperationsSmokeFailure("local database required");
  const db = new Bun.SQL(parsed.databaseUrl, { max: 2, prepare: false });
  const checks = Object.fromEntries(
    PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_SCENARIOS.map((name) => [name, false]),
  ) as Checks;
  let fixture: PlatformServiceTrialFixture | null = null;
  try {
    fixture = await createPlatformServiceTrialFixture(db);
    Object.assign(checks, await runOperationsTransaction(db, fixture));
  } finally {
    try {
      if (fixture) {
        checks.fixture_cleanup = await cleanupPlatformServiceTrialFixture(db, fixture);
      }
    } finally {
      await db.close();
    }
  }
  const failedChecks = PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_SCENARIOS.filter(
    (name) => !checks[name],
  );
  if (failedChecks.length > 0) {
    throw new TrialOperationsSmokeFailure(
      `operations assertion failed: ${failedChecks.join(",")}`,
    );
  }
  return buildTrialOperationsSmokeSummary(checks);
}

async function runOperationsTransaction(
  db: TrialSql,
  fixture: PlatformServiceTrialFixture,
) {
  let transactionChecks: Pick<Checks,
    "time_boundary_once" | "failed_delivery_retry" | "follow_up_pagination"
  > | null = null;
  try {
    await db.begin(async (tx) => {
      const trial = await grantOperationsTrial(tx, fixture);
      const nowRows = await tx<Array<{ now: string }>>`
        select clock_timestamp()::text as now;
      `;
      const now = nowRows[0]?.now;
      if (!now) throw new TrialOperationsSmokeFailure("database clock missing");
      await prepareTimeBoundaries(tx, trial, now);
      transactionChecks = {
        time_boundary_once: await verifyTimeBoundaryOnce(tx, trial, now),
        failed_delivery_retry: await verifyFailedDeliveryRetry(tx, trial),
        follow_up_pagination: await verifyFollowUpPagination(tx, fixture, trial),
      };
      throw new RollbackSmokeTransaction();
    });
  } catch (error) {
    if (!(error instanceof RollbackSmokeTransaction)) throw error;
  }
  if (!transactionChecks) {
    throw new TrialOperationsSmokeFailure("operations transaction incomplete");
  }
  return transactionChecks;
}

type OperationsTrial = { trialId: string; tenantId: string };

async function grantOperationsTrial(
  db: TrialSql,
  fixture: PlatformServiceTrialFixture,
): Promise<OperationsTrial> {
  const tenantId = fixture.tenants.grant.tenantId;
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_grant(
      ${tenantId}::uuid, ${fixture.platformAdminId}::uuid, 'standard',
      ${{ version: 1, capabilities: ["core.projects"] }}::jsonb,
      'Task operations smoke', ${crypto.randomUUID()}::uuid,
      30, 7, null, null, false
    ) as result;
  `;
  const trialId = rows[0]?.result?.trial_id;
  if (typeof trialId !== "string") {
    throw new TrialOperationsSmokeFailure("grant result invalid");
  }
  return { trialId, tenantId };
}

async function prepareTimeBoundaries(
  db: TrialSql,
  trial: OperationsTrial,
  now: string,
) {
  await db`
    update public.platform_service_trial_operations_state
    set cutover_at = ${now}::timestamptz - interval '60 days'
    where singleton is true;
  `;
  await db`
    update public.tenant_service_trials
    set status = 'active', starts_at = ${now}::timestamptz - interval '31 days',
      activated_at = ${now}::timestamptz - interval '31 days',
      trial_ends_at = ${now}::timestamptz - interval '1 day',
      grace_ends_at = ${now}::timestamptz - interval '1 minute',
      created_at = ${now}::timestamptz - interval '40 days',
      policy_snapshot = jsonb_set(policy_snapshot, '{reminder_days}', '[7,3,1]'),
      version = version + 1
    where id = ${trial.trialId}::uuid and tenant_id = ${trial.tenantId}::uuid;
  `;
}

async function verifyTimeBoundaryOnce(
  db: TrialSql,
  trial: OperationsTrial,
  now: string,
) {
  const first = await db<Array<{ count: number }>>`
    select public.platform_service_trial_enqueue_due_notifications(
      ${now}::timestamptz
    )::int as count;
  `;
  const second = await db<Array<{ count: number }>>`
    select public.platform_service_trial_enqueue_due_notifications(
      ${now}::timestamptz
    )::int as count;
  `;
  const groups = await db<Array<{ event_type: string; count: number }>>`
    select event_type, count(*)::int as count
    from public.tenant_service_trial_notification_deliveries
    where trial_id = ${trial.trialId}::uuid and source = 'time_boundary'
    group by event_type order by event_type;
  `;
  const expected = new Set([
    "expires_in_7_days", "expires_in_3_days", "expires_in_1_day",
    "entered_grace", "expired",
  ]);
  return first[0]?.count === 5 && second[0]?.count === 0
    && groups.length === 5
    && groups.every((group) => expected.has(group.event_type) && group.count === 1);
}

async function verifyFailedDeliveryRetry(db: TrialSql, trial: OperationsTrial) {
  const claimed = await claimDeliveries(db, 5);
  if (claimed.length !== 5 || claimed.some((row) => row.trial_id !== trial.trialId)) {
    throw new TrialOperationsSmokeFailure("initial delivery claims invalid");
  }
  const [first, ...remaining] = claimed;
  if (!first) throw new TrialOperationsSmokeFailure("initial delivery claim missing");
  for (const delivery of remaining) {
    await db`
      select public.platform_service_trial_complete_notification_delivery(
        ${delivery.delivery_id}::uuid, ${delivery.lease_token}::uuid, null
      );
    `;
  }
  await db`
    select public.platform_service_trial_fail_notification_delivery(
      ${first.delivery_id}::uuid, ${first.lease_token}::uuid,
      'smoke_delivery_failed'
    );
  `;
  await withDeliveryGuard(db, () => db`
    update public.tenant_service_trial_notification_deliveries
    set retry_at = clock_timestamp() - interval '1 minute'
    where id = ${first.delivery_id}::uuid;
  `);
  const retried = (await claimDeliveries(db, 1))[0] ?? null;
  if (!retried) {
    throw new TrialOperationsSmokeFailure("retry delivery claim missing");
  }
  if (retried.delivery_id !== first.delivery_id) {
    throw new TrialOperationsSmokeFailure("retry claimed a different delivery");
  }
  if (retried.lease_token === first.lease_token) {
    throw new TrialOperationsSmokeFailure("retry lease token was not rotated");
  }
  const completed = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_complete_notification_delivery(
      ${retried.delivery_id}::uuid, ${retried.lease_token}::uuid, null
    ) as result;
  `;
  const replay = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_complete_notification_delivery(
      ${retried.delivery_id}::uuid, ${retried.lease_token}::uuid, null
    ) as result;
  `;
  const rows = await db<Array<{ status: string; attempt_count: number }>>`
    select status, attempt_count from public.tenant_service_trial_notification_deliveries
    where id = ${first.delivery_id}::uuid;
  `;
  const verified = completed[0]?.result?.status === "sent"
    && completed[0]?.result?.idempotent === false
    && replay[0]?.result?.idempotent === true
    && rows[0]?.status === "sent" && rows[0]?.attempt_count === 1;
  if (!verified) {
    throw new TrialOperationsSmokeFailure(JSON.stringify({
      completedStatus: completed[0]?.result?.status,
      completedIdempotent: completed[0]?.result?.idempotent,
      replayIdempotent: replay[0]?.result?.idempotent,
      storedStatus: rows[0]?.status,
      attemptCount: rows[0]?.attempt_count,
    }));
  }
  return true;
}

function claimDeliveries(db: TrialSql, limit: number) {
  return db<Array<{
    delivery_id: string;
    lease_token: string;
    trial_id: string;
  }>>`
    select delivery_id, lease_token
      , trial_id
    from public.platform_service_trial_claim_notification_deliveries(${limit});
  `;
}

async function verifyFollowUpPagination(
  db: TrialSql,
  fixture: PlatformServiceTrialFixture,
  trial: OperationsTrial,
) {
  const keys = Array.from({ length: 23 }, () => crypto.randomUUID());
  for (const [index, key] of keys.entries()) {
    await db`
      select public.platform_service_trial_create_follow_up(
        ${fixture.platformAdminId}::uuid, ${trial.trialId}::uuid,
        ${trial.tenantId}::uuid, 'phone', 'completed',
        ${`Task operations follow-up ${index + 1}`}, 'Local smoke result',
        null, ${key}::uuid
      );
    `;
  }
  const replay = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_create_follow_up(
      ${fixture.platformAdminId}::uuid, ${trial.trialId}::uuid,
      ${trial.tenantId}::uuid, 'phone', 'completed',
      'Task operations follow-up 1', 'Local smoke result', null,
      ${keys[0]}::uuid
    ) as result;
  `;
  const first = await followUpPage(db, trial.trialId, 0);
  const second = await followUpPage(db, trial.trialId, 10);
  const total = await db<Array<{ count: number }>>`
    select count(*)::int as count from public.tenant_service_trial_followups
    where trial_id = ${trial.trialId}::uuid;
  `;
  const ids = [...first, ...second].map((row) => row.id);
  return replay[0]?.result?.idempotent === true && total[0]?.count === 23
    && first.length === 10 && second.length === 10
    && new Set(ids).size === 20;
}

function followUpPage(db: TrialSql, trialId: string, offset: number) {
  return db<Array<{ id: string }>>`
    select id from public.tenant_service_trial_followups
    where trial_id = ${trialId}::uuid
    order by created_at desc, id desc limit 10 offset ${offset};
  `;
}

async function withDeliveryGuard<T>(db: TrialSql, operation: () => Promise<T>) {
  await db`select set_config('app.platform_service_trial_notification_guard', 'enabled', true);`;
  const result = await operation();
  await db`select set_config('app.platform_service_trial_notification_guard', '', true);`;
  return result;
}

export async function runPlatformServiceTrialOperationsSmokeCli(
  input: CliInput,
): Promise<number> {
  const parsed = parseLocalTrialOperationsDatabaseUrl(input.databaseUrl);
  const writeStdout = input.writeStdout ?? console.log;
  const writeStderr = input.writeStderr ?? console.error;
  if (!parsed.ok) {
    writeStderr(PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_FAILED);
    return 1;
  }
  try {
    const summary = await withIsolatedPlatformServiceTrialEnvironment(() =>
      (input.runSmoke ?? runPlatformServiceTrialOperationsSmoke)(parsed.databaseUrl)
    );
    if (PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_SCENARIOS.some(
      (name) => !summary[name],
    )) throw new TrialOperationsSmokeFailure("smoke check failed");
    writeStdout(JSON.stringify({ ok: true, ...summary }));
    return 0;
  } catch {
    writeStderr(PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_FAILED);
    return 1;
  }
}

if (import.meta.main) {
  void runPlatformServiceTrialOperationsSmokeCli({
    databaseUrl: process.env.SUPABASE_DB_DIRECT_URL,
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
