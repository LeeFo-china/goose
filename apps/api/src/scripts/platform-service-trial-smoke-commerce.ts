import {
  readAccessFacts,
  verifyAccessDecisions,
} from "./platform-service-trial-smoke-lifecycle";
import type {
  PlatformServiceTrialFixture,
  SmokeJson,
  TrialSql,
} from "./platform-service-trial-smoke-fixture";

type CommerceChecks = {
  access_priority_hard_block_capability_grace: boolean;
  source_trial_order_uniqueness_release: boolean;
  payment_conversion_idempotency: boolean;
  payment_anomaly_preserves_money_and_work_order: boolean;
  concurrent_source_create_confirm: boolean;
  upgrade_preflight: boolean;
};

const CONCURRENCY_ITERATIONS = 12;
const CONCURRENCY_TIMEOUT_MS = 20_000;
const PROJECT_SCOPE = { version: 1, capabilities: ["core.projects"] };

export async function runTrialCommerceScenarios(
  db: TrialSql,
  dbA: TrialSql,
  dbB: TrialSql,
  fixture: PlatformServiceTrialFixture,
): Promise<CommerceChecks> {
  const tenant = fixture.tenants.commerce;
  const trial = await grantCommerceTrial(db, fixture);
  const trialId = String(trial.trial_id);
  const accessTrialGrace = await verifyAccessDecisions(db, tenant.tenantId);

  const first = await createPendingOrder(db, fixture, trialId, "cancel-first");
  const duplicateBlocked = await hasErrorCode(
    () => createPendingOrder(db, fixture, trialId, "duplicate-open"),
    "SERVICE_TRIAL_ORDER_SOURCE_INVALID",
  );
  const cancelKey = crypto.randomUUID();
  const claim = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_claim_pending_order_cancel(
      ${tenant.tenantId}::uuid, ${first.id}::uuid, ${first.version},
      ${cancelKey}::uuid, 'user_cancelled', ${tenant.employeeId}::uuid
    ) as result;
  `;
  const closed = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_cancel_pending_order(
      ${tenant.tenantId}::uuid, ${first.id}::uuid, ${first.version},
      ${cancelKey}::uuid, false
    ) as result;
  `;
  const second = await createPendingOrder(db, fixture, trialId, "conversion");
  const sourceReleased = duplicateBlocked
    && claim[0]?.result.claimed === true
    && (closed[0]?.result.order as SmokeJson)?.payment_status === "closed"
    && second.id !== first.id;

  const paid = await confirmOrder(db, fixture, second, "conversion");
  const paidReplay = await confirmOrder(db, fixture, second, "conversion");
  const trialFacts = await db<Array<SmokeJson>>`
    select status, converted_order_id, converted_at
    from public.tenant_service_trials where id = ${trialId}::uuid;
  `;
  const converted = trialFacts[0]?.status === "converted"
    && trialFacts[0]?.converted_order_id === second.id
    && trialFacts[0]?.converted_at != null
    && paid.idempotent === false && paidReplay.idempotent === true
    && String((paid.work_order as SmokeJson).id)
      === String((paidReplay.work_order as SmokeJson).id);

  const { TenantServiceAccessService } = await import("../services/tenant-service-access");
  const service = new TenantServiceAccessService({
    repository: { getAccessFacts: async () => readAccessFacts(db, tenant.tenantId) },
  });
  const paidDecision = await service.resolveForRoute({
    tenantId: tenant.tenantId, routeAccess: "write",
  });
  await db`update public.tenants set status = 'suspended'
    where id = ${tenant.tenantId}::uuid`;
  const hardBlock = await service.resolveForRoute({
    tenantId: tenant.tenantId, routeAccess: "write",
  });
  await db`update public.tenants set status = 'active'
    where id = ${tenant.tenantId}::uuid`;

  await closePaidFixtureOrder(db, second.id);
  const anomalyOrder = await createPendingOrder(db, fixture, trialId, "anomaly");
  const anomaly = await confirmOrder(db, fixture, anomalyOrder, "anomaly");
  const anomalyReplay = await confirmOrder(db, fixture, anomalyOrder, "anomaly");
  const anomalyFacts = await db<Array<{ payment_status: string; paid_amount_fen: number;
    amount_fen: number; work_order_count: number; anomaly_count: number }>>`
    select service_order.payment_status,
      service_order.paid_amount_fen::int, service_order.amount_fen::int,
      (select count(*)::int from public.tenant_service_work_orders
        where service_order_id = service_order.id) as work_order_count,
      (select count(*)::int from public.tenant_service_trial_events
        where trial_id = ${trialId}::uuid and event_type = 'conversion_anomaly'
          and metadata->>'order_id' = service_order.id::text) as anomaly_count
    from public.tenant_service_orders as service_order
    where service_order.id = ${anomalyOrder.id}::uuid;
  `;
  const anomalyPreserved =
    (anomaly.conversion_anomaly as SmokeJson)?.code === "TRIAL_ALREADY_ATTRIBUTED"
    && anomalyReplay.idempotent === true
    && (anomalyReplay.conversion_anomaly as SmokeJson)?.code
      === "TRIAL_ALREADY_ATTRIBUTED"
    && anomalyFacts[0]?.payment_status === "paid"
    && anomalyFacts[0]?.paid_amount_fen === anomalyFacts[0]?.amount_fen
    && anomalyFacts[0]?.work_order_count === 1
    && anomalyFacts[0]?.anomaly_count === 1;
  await closePaidFixtureOrder(db, anomalyOrder.id);

  const concurrency = await withTimeout(
    runSourceConcurrency(db, dbA, dbB, fixture, trialId),
    CONCURRENCY_TIMEOUT_MS,
  );
  return {
    access_priority_hard_block_capability_grace: accessTrialGrace
      && paidDecision.mode === "paid_onboarding" && paidDecision.allowed
      && hardBlock.mode === "hard_blocked" && !hardBlock.allowed
      && hardBlock.errorCode === "TENANT_SERVICE_HARD_BLOCKED",
    source_trial_order_uniqueness_release: sourceReleased,
    payment_conversion_idempotency: converted,
    payment_anomaly_preserves_money_and_work_order: anomalyPreserved,
    concurrent_source_create_confirm: concurrency,
    upgrade_preflight: await verifyUpgradePreflight(db),
  };
}

async function grantCommerceTrial(
  db: TrialSql,
  fixture: PlatformServiceTrialFixture,
): Promise<SmokeJson> {
  const tenant = fixture.tenants.commerce;
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_grant(
      ${tenant.tenantId}::uuid, ${fixture.platformAdminId}::uuid, 'standard',
      ${PROJECT_SCOPE}::jsonb, 'Task8 commerce',
      ${crypto.randomUUID()}::uuid, 2, 1, null, null, false
    ) as result;
  `;
  return requireResult(rows);
}

type PendingOrder = { id: string; version: number; transactionId: string };

async function createPendingOrder(
  db: TrialSql,
  fixture: PlatformServiceTrialFixture,
  trialId: string,
  label: string,
): Promise<PendingOrder> {
  const tenant = fixture.tenants.commerce;
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const rows = await db<Array<{ result: SmokeJson }>>`
    select to_jsonb(public.platform_service_create_pending_order(
      ${tenant.tenantId}::uuid, ${fixture.productId}::uuid,
      ${fixture.productVersionId}::uuid, ${`TASK8-${label}-${suffix}`},
      ${`task8-trade-${suffix}`}, ${crypto.randomUUID()}::uuid,
      ${fixture.productCode}, 1, '{}'::jsonb, 1, ${fixture.amountFen}::bigint,
      ${fixture.paymentConfigId}::uuid, ${fixture.paymentConfigGuardVersion},
      ${`task8-openid-${suffix}`}, clock_timestamp() + interval '15 minutes',
      1, clock_timestamp(), ${tenant.employeeId}::uuid,
      'platform_service', ${trialId}::uuid
    )) as result;
  `;
  const order = requireResult(rows);
  return {
    id: String(order.id),
    version: Number(order.version),
    transactionId: `task8-tx-${suffix}`,
  };
}

async function confirmOrder(
  db: TrialSql,
  fixture: PlatformServiceTrialFixture,
  order: PendingOrder,
  label: string,
): Promise<SmokeJson> {
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_confirm_payment(
      ${order.id}::uuid, ${order.transactionId}, ${fixture.amountFen}::bigint,
      clock_timestamp(), ${crypto.randomUUID()}::uuid,
      ${{ source: label }}::jsonb
    ) as result;
  `;
  return requireResult(rows);
}

async function closePaidFixtureOrder(db: TrialSql, orderId: string): Promise<void> {
  await db`
    update public.tenant_service_orders set payment_status = 'closed',
      closed_at = clock_timestamp() where id = ${orderId}::uuid;
  `;
}

async function runSourceConcurrency(
  db: TrialSql,
  dbA: TrialSql,
  dbB: TrialSql,
  fixture: PlatformServiceTrialFixture,
  trialId: string,
): Promise<boolean> {
  for (let iteration = 0; iteration < CONCURRENCY_ITERATIONS; iteration += 1) {
    const current = await createPendingOrder(db, fixture, trialId, `race-${iteration}`);
    const [createResult, confirmResult] = await Promise.allSettled([
      createPendingOrder(dbA, fixture, trialId, `contender-${iteration}`),
      confirmOrder(dbB, fixture, current, `race-${iteration}`),
    ]);
    if (
      createResult.status !== "rejected"
      || !(createResult.reason instanceof Error)
      || !createResult.reason.message.includes("SERVICE_TRIAL_ORDER_SOURCE_INVALID")
      || confirmResult.status !== "fulfilled"
      || (confirmResult.value.order as SmokeJson)?.payment_status !== "paid"
    ) return false;
    await closePaidFixtureOrder(db, current.id);
  }
  return true;
}

async function verifyUpgradePreflight(db: TrialSql): Promise<boolean> {
  const rows = await db<Array<{
    migration_applied: boolean;
    source_constraint: boolean;
    role_function_safe: boolean;
    service_role_execute: boolean;
    authenticated_execute: boolean;
  }>>`
    select
      exists (select 1 from supabase_migrations.schema_migrations
        where version = '20260811084344') as migration_applied,
      exists (select 1 from pg_constraint
        where conname = 'tenant_service_orders_source_trial_tenant_fkey')
        as source_constraint,
      position('updated_at = now()' in substring(
        pg_get_functiondef('public.replace_platform_role_permissions(uuid,uuid,uuid,integer,uuid,uuid[])'::regprocedure)
        from position('UPDATE public.employees' in pg_get_functiondef(
          'public.replace_platform_role_permissions(uuid,uuid,uuid,integer,uuid,uuid[])'::regprocedure
        ))
      )) = 0 as role_function_safe,
      has_function_privilege('service_role',
        'public.replace_platform_role_permissions(uuid,uuid,uuid,integer,uuid,uuid[])',
        'EXECUTE') as service_role_execute,
      has_function_privilege('authenticated',
        'public.replace_platform_role_permissions(uuid,uuid,uuid,integer,uuid,uuid[])',
        'EXECUTE') as authenticated_execute;
  `;
  const fact = rows[0];
  return fact?.migration_applied === true && fact.source_constraint === true
    && fact.role_function_safe === true && fact.service_role_execute === true
    && fact.authenticated_execute === false;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error("trial smoke timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function hasErrorCode(
  operation: () => Promise<unknown>,
  code: string,
): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes(code);
  }
}

function requireResult(rows: Array<{ result: SmokeJson }>): SmokeJson {
  if (!rows[0]?.result) throw new Error("trial smoke result missing");
  return rows[0].result;
}
