import {
  cleanupDouyinBudgetAiDatabaseFixture,
  createDouyinBudgetAiDatabaseFixture,
  type DatabaseSql,
  type DouyinBudgetAiDatabaseFixture,
} from './ai-explanation-database-fixture.test-helper';

export const DOUYIN_BUDGET_AI_DATABASE_SCENARIOS = [
  'concurrent_single_claim',
  'live_processing_saved',
  'stale_reclaim',
  'attempt_three_exhausted',
  'failed_retry',
  'stale_completion_noop',
  'stale_failure_noop',
  'correct_completion',
  'correct_failure',
  'trigger_enforced',
  'acl_enforced',
  'fixture_cleanup',
] as const;

type Scenario = (typeof DOUYIN_BUDGET_AI_DATABASE_SCENARIOS)[number];
type Summary = Record<Scenario, boolean>;
type JsonRecord = Record<string, unknown>;

const DEFAULT_LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ANALYSIS = {
  summary: '本地数据库集成验证',
  allocation_advice: [],
  risk_factors: [],
  onsite_questions: [],
};

class DatabaseIntegrationFailure extends Error {}

export function parseLocalDouyinBudgetDatabaseUrl(
  input: string | undefined,
): { ok: true; databaseUrl: string } | { ok: false } {
  const databaseUrl = input?.trim() || DEFAULT_LOCAL_DATABASE_URL;
  try {
    const url = new URL(databaseUrl);
    const isLocalHost = url.hostname === '127.0.0.1'
      || url.hostname === 'localhost';
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol)
      || !isLocalHost
      || url.port !== '54322'
      || url.pathname !== '/postgres'
      || url.username !== 'postgres'
      || url.password !== 'postgres'
      || url.search !== ''
      || url.hash !== ''
    ) return { ok: false };
    return { ok: true, databaseUrl };
  } catch {
    return { ok: false };
  }
}

export async function runDouyinBudgetAiDatabaseIntegration(
  databaseUrl?: string,
): Promise<Summary> {
  const parsed = parseLocalDouyinBudgetDatabaseUrl(databaseUrl);
  if (!parsed.ok) throw new DatabaseIntegrationFailure('LOCAL_DATABASE_REQUIRED');
  const admin = new Bun.SQL(parsed.databaseUrl, { max: 1, prepare: false });
  const service = new Bun.SQL(parsed.databaseUrl, { max: 1, prepare: false });
  const serviceA = new Bun.SQL(parsed.databaseUrl, { max: 1, prepare: false });
  const serviceB = new Bun.SQL(parsed.databaseUrl, { max: 1, prepare: false });
  const summary = emptySummary();
  let fixture: DouyinBudgetAiDatabaseFixture | null = null;
  let scenarioFailure: unknown;
  let cleanupFailure: unknown;

  try {
    fixture = await createDouyinBudgetAiDatabaseFixture(admin);
    await Promise.all([
      configureServiceConnection(service),
      configureServiceConnection(serviceA),
      configureServiceConnection(serviceB),
    ]);
    await runScenarios(admin, service, serviceA, serviceB, fixture, summary);
  } catch (error) {
    scenarioFailure = error;
  } finally {
    const serviceCloseResults = await Promise.allSettled([
      service.close(),
      serviceA.close(),
      serviceB.close(),
    ]);
    if (serviceCloseResults.some((result) => result.status === 'rejected')) {
      scenarioFailure ??= new DatabaseIntegrationFailure(
        'SERVICE_CONNECTION_CLOSE_FAILED',
      );
    }
    if (fixture) {
      try {
        summary.fixture_cleanup = await cleanupDouyinBudgetAiDatabaseFixture(
          admin,
          fixture,
        );
      } catch (error) {
        cleanupFailure = error;
      }
    }
    try {
      await admin.close();
    } catch (error) {
      cleanupFailure ??= error;
    }
  }

  if (scenarioFailure || cleanupFailure) {
    throw new DatabaseIntegrationFailure([
      scenarioFailure ? stableFailure('SCENARIO', scenarioFailure) : null,
      cleanupFailure ? stableFailure('CLEANUP', cleanupFailure) : null,
    ].filter(Boolean).join(':'));
  }
  const failedScenarios = DOUYIN_BUDGET_AI_DATABASE_SCENARIOS.filter(
    (name) => !summary[name],
  );
  if (failedScenarios.length > 0) {
    throw new DatabaseIntegrationFailure(
      `DATABASE_ASSERTION_FAILED_${failedScenarios.join('_')}`,
    );
  }
  return summary;
}

async function runScenarios(
  admin: DatabaseSql,
  service: DatabaseSql,
  serviceA: DatabaseSql,
  serviceB: DatabaseSql,
  fixture: DouyinBudgetAiDatabaseFixture,
  summary: Summary,
): Promise<void> {
  const concurrent = await Promise.all([
    claim(serviceA, fixture, fixture.estimates.concurrent, false),
    claim(serviceB, fixture, fixture.estimates.concurrent, false),
  ]);
  summary.concurrent_single_claim = concurrent
    .map(actionOf)
    .sort()
    .join(',') === 'claimed,saved';

  const live = await claim(service, fixture, fixture.estimates.live, false);
  summary.live_processing_saved = actionOf(live) === 'saved'
    && estimateOf(live).ai_status === 'pending'
    && estimateOf(live).ai_attempt_count === 1;

  const reclaimed = await claim(
    service,
    fixture,
    fixture.estimates.stale,
    false,
  );
  const currentLease = leaseOf(reclaimed);
  summary.stale_reclaim = actionOf(reclaimed) === 'claimed'
    && currentLease.attempt_count === 2;

  const staleCompletion = await complete(service, fixture, {
    estimateId: fixture.estimates.stale,
    attemptCount: 1,
    claimedAt: fixture.staleClaimedAt,
  });
  summary.stale_completion_noop = estimateOfMutation(staleCompletion).ai_status
    === 'pending'
    && estimateOfMutation(staleCompletion).ai_attempt_count === 2;
  const staleFailure = await fail(service, fixture, {
    estimateId: fixture.estimates.stale,
    attemptCount: 1,
    claimedAt: fixture.staleClaimedAt,
  });
  summary.stale_failure_noop = estimateOfMutation(staleFailure).ai_status
    === 'pending'
    && estimateOfMutation(staleFailure).ai_attempt_count === 2;
  const completed = await complete(service, fixture, {
    estimateId: fixture.estimates.stale,
    attemptCount: currentLease.attempt_count,
    claimedAt: currentLease.claimed_at,
  });
  summary.correct_completion = estimateOfMutation(completed).ai_status
    === 'succeeded';

  const exhausted = await claim(
    service,
    fixture,
    fixture.estimates.exhausted,
    false,
  );
  const exhaustedFacts = await readEstimate(admin, fixture.estimates.exhausted);
  summary.attempt_three_exhausted = actionOf(exhausted) === 'saved'
    && exhaustedFacts.ai_status === 'failed'
    && exhaustedFacts.ai_attempt_count === 3
    && exhaustedFacts.ai_last_error_code
      === 'DOUYIN_BUDGET_AI_ATTEMPTS_EXHAUSTED';

  const savedFailed = await claim(
    service,
    fixture,
    fixture.estimates.failed,
    false,
  );
  const retried = await claim(
    service,
    fixture,
    fixture.estimates.failed,
    true,
  );
  const retryLease = leaseOf(retried);
  summary.failed_retry = actionOf(savedFailed) === 'saved'
    && actionOf(retried) === 'claimed'
    && retryLease.attempt_count === 2;
  const failed = await fail(service, fixture, {
    estimateId: fixture.estimates.failed,
    attemptCount: retryLease.attempt_count,
    claimedAt: retryLease.claimed_at,
  });
  summary.correct_failure = estimateOfMutation(failed).ai_status === 'failed';

  summary.trigger_enforced = await triggerRejectsImmutableUpdate(admin, fixture);
  summary.acl_enforced = await verifyAcl(admin, service, fixture);
}

async function configureServiceConnection(database: DatabaseSql): Promise<void> {
  await database`set statement_timeout = '5s'`;
  await database`set lock_timeout = '2s'`;
  await database`set role service_role`;
}

async function claim(
  database: DatabaseSql,
  fixture: DouyinBudgetAiDatabaseFixture,
  estimateId: string,
  retry: boolean,
): Promise<JsonRecord> {
  const rows = await database<Array<{ result: JsonRecord }>>`
    select public.claim_douyin_budget_ai_analysis(
      ${estimateId}::uuid, ${fixture.tenantId}::uuid,
      ${fixture.installationId}::uuid, ${fixture.subjectHash}, ${retry}
    ) as result;
  `;
  return requireResult(rows);
}

async function complete(
  database: DatabaseSql,
  fixture: DouyinBudgetAiDatabaseFixture,
  lease: { estimateId: string; attemptCount: number; claimedAt: string },
): Promise<JsonRecord> {
  const rows = await database<Array<{ result: JsonRecord }>>`
    select public.complete_douyin_budget_ai_analysis(
      ${lease.estimateId}::uuid, ${fixture.tenantId}::uuid,
      ${fixture.installationId}::uuid, ${fixture.subjectHash},
      ${lease.attemptCount}, ${lease.claimedAt}::timestamptz,
      ${ANALYSIS}::jsonb, 'local-integration', 'local-model'
    ) as result;
  `;
  return requireResult(rows);
}

async function fail(
  database: DatabaseSql,
  fixture: DouyinBudgetAiDatabaseFixture,
  lease: { estimateId: string; attemptCount: number; claimedAt: string },
): Promise<JsonRecord> {
  const rows = await database<Array<{ result: JsonRecord }>>`
    select public.fail_douyin_budget_ai_analysis(
      ${lease.estimateId}::uuid, ${fixture.tenantId}::uuid,
      ${fixture.installationId}::uuid, ${fixture.subjectHash},
      ${lease.attemptCount}, ${lease.claimedAt}::timestamptz,
      'DOUYIN_BUDGET_AI_GATEWAY_FAILED'
    ) as result;
  `;
  return requireResult(rows);
}

async function verifyAcl(
  admin: DatabaseSql,
  service: DatabaseSql,
  fixture: DouyinBudgetAiDatabaseFixture,
): Promise<boolean> {
  const rows = await admin<Array<Record<string, boolean>>>`
    select
      has_table_privilege('service_role', 'public.douyin_budget_estimates', 'select')
        as table_select,
      has_table_privilege('service_role', 'public.douyin_budget_estimates', 'update')
        as table_update,
      has_table_privilege('service_role', 'public.douyin_budget_estimates', 'insert')
        as table_insert,
      has_table_privilege('service_role', 'public.douyin_budget_estimates', 'delete')
        as table_delete,
      has_function_privilege('service_role',
        'public.claim_douyin_budget_ai_analysis(uuid,uuid,uuid,text,boolean)',
        'execute') as service_claim,
      has_function_privilege('service_role',
        'public.complete_douyin_budget_ai_analysis(uuid,uuid,uuid,text,integer,timestamptz,jsonb,text,text)',
        'execute') as service_complete,
      has_function_privilege('service_role',
        'public.fail_douyin_budget_ai_analysis(uuid,uuid,uuid,text,integer,timestamptz,text)',
        'execute') as service_fail,
      has_function_privilege('anon',
        'public.claim_douyin_budget_ai_analysis(uuid,uuid,uuid,text,boolean)',
        'execute') as anon_claim,
      has_function_privilege('anon',
        'public.complete_douyin_budget_ai_analysis(uuid,uuid,uuid,text,integer,timestamptz,jsonb,text,text)',
        'execute') as anon_complete,
      has_function_privilege('anon',
        'public.fail_douyin_budget_ai_analysis(uuid,uuid,uuid,text,integer,timestamptz,text)',
        'execute') as anon_fail,
      has_function_privilege('authenticated',
        'public.claim_douyin_budget_ai_analysis(uuid,uuid,uuid,text,boolean)',
        'execute') as authenticated_claim,
      has_function_privilege('authenticated',
        'public.complete_douyin_budget_ai_analysis(uuid,uuid,uuid,text,integer,timestamptz,jsonb,text,text)',
        'execute') as authenticated_complete,
      has_function_privilege('authenticated',
        'public.fail_douyin_budget_ai_analysis(uuid,uuid,uuid,text,integer,timestamptz,text)',
        'execute') as authenticated_fail;
  `;
  let updateDenied = false;
  try {
    await service`
      update public.douyin_budget_estimates set updated_at = clock_timestamp()
      where id = ${fixture.estimates.live}::uuid;
    `;
  } catch (error) {
    updateDenied = errorCode(error) === '42501';
  }
  const acl = rows[0];
  return acl?.table_select === true
    && acl.table_update === false
    && acl.table_insert === false
    && acl.table_delete === false
    && acl.service_claim === true
    && acl.service_complete === true
    && acl.service_fail === true
    && acl.anon_claim === false
    && acl.anon_complete === false
    && acl.anon_fail === false
    && acl.authenticated_claim === false
    && acl.authenticated_complete === false
    && acl.authenticated_fail === false
    && updateDenied;
}

async function triggerRejectsImmutableUpdate(
  admin: DatabaseSql,
  fixture: DouyinBudgetAiDatabaseFixture,
): Promise<boolean> {
  try {
    await admin`
      update public.douyin_budget_estimates set result_payload = '{"forged":true}'
      where id = ${fixture.estimates.live}::uuid;
    `;
    return false;
  } catch (error) {
    return errorCode(error) === 'P0001'
      && errorMessage(error).includes('DOUYIN_BUDGET_ESTIMATE_IMMUTABLE');
  }
}

async function readEstimate(
  admin: DatabaseSql,
  estimateId: string,
): Promise<Record<string, unknown>> {
  const rows = await admin<Array<Record<string, unknown>>>`
    select ai_status, ai_attempt_count, ai_last_error_code
    from public.douyin_budget_estimates where id = ${estimateId}::uuid;
  `;
  const row = rows[0];
  if (!row) throw new DatabaseIntegrationFailure('ESTIMATE_NOT_FOUND');
  return row;
}

function actionOf(envelope: JsonRecord): string | undefined {
  return dataOf(envelope).action as string | undefined;
}

function estimateOf(envelope: JsonRecord): JsonRecord {
  return requireRecord(dataOf(envelope).estimate, 'CLAIM_ESTIMATE_INVALID');
}

function estimateOfMutation(envelope: JsonRecord): JsonRecord {
  return requireRecord(dataOf(envelope).estimate, 'MUTATION_ESTIMATE_INVALID');
}

function leaseOf(envelope: JsonRecord): {
  attempt_count: number;
  claimed_at: string;
} {
  const lease = requireRecord(dataOf(envelope).lease, 'LEASE_INVALID');
  if (typeof lease.attempt_count !== 'number' || typeof lease.claimed_at !== 'string') {
    throw new DatabaseIntegrationFailure('LEASE_INVALID');
  }
  return {
    attempt_count: lease.attempt_count,
    claimed_at: lease.claimed_at,
  };
}

function dataOf(envelope: JsonRecord): JsonRecord {
  return requireRecord(envelope.data, 'RPC_ENVELOPE_INVALID');
}

function requireResult(rows: Array<{ result: JsonRecord }>): JsonRecord {
  return requireRecord(rows[0]?.result, 'RPC_RESULT_MISSING');
}

function requireRecord(value: unknown, code: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatabaseIntegrationFailure(code);
  }
  return value as JsonRecord;
}

function emptySummary(): Summary {
  return Object.fromEntries(
    DOUYIN_BUDGET_AI_DATABASE_SCENARIOS.map((name) => [name, false]),
  ) as Summary;
}

function errorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined;
  if ('errno' in error && typeof error.errno === 'string') return error.errno;
  return 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function stableFailure(stage: string, error: unknown): string {
  return `${stage}_${errorCode(error) ?? 'FAILED'}`;
}
