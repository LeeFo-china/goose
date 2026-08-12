import type { TenantServiceAccessFacts } from "../repositories/tenant-service-access";
import type {
  PlatformServiceTrialFixture,
  SmokeJson,
  TrialSql,
} from "./platform-service-trial-smoke-fixture";

type LifecycleChecks = {
  apply_pending: boolean;
  application_replay: boolean;
  application_repeat_cooldown: boolean;
  review_scheduled_active_grace_expired: boolean;
  grant_replay_conflict: boolean;
  expected_version: boolean;
  enterprise_cross_tenant_duplicate: boolean;
  extend_revoke: boolean;
  permission_override_actor_revocation: boolean;
  database_clock: boolean;
  effective_list_count_privacy: boolean;
};

const PROJECT_SCOPE = {
  version: 1,
  capabilities: ["core.projects"],
};

export async function runTrialLifecycleScenarios(
  db: TrialSql,
  fixture: PlatformServiceTrialFixture,
): Promise<LifecycleChecks> {
  const lifecycle = fixture.tenants.lifecycle;
  const applyKey = crypto.randomUUID();
  const applied = await applyTrial(db, lifecycle.tenantId, lifecycle.employeeId, applyKey);
  const pendingRows = await db<Array<{ status: string; version: number }>>`
    select status, version from public.tenant_service_trials
    where id = ${String(applied.trial_id)}::uuid;
  `;
  const applyPending = applied.status === "pending_review"
    && applied.idempotent === false
    && pendingRows[0]?.status === "pending_review"
    && pendingRows[0]?.version === 1;
  const pendingAccessFacts = await readAccessFacts(db, lifecycle.tenantId);
  const replay = await applyTrial(db, lifecycle.tenantId, lifecycle.employeeId, applyKey);
  const replayConflict = await hasErrorCode(
    () => applyTrial(db, lifecycle.tenantId, lifecycle.employeeId, applyKey, "changed"),
    "SERVICE_TRIAL_IDEMPOTENCY_CONFLICT",
  );
  const pendingConflict = await hasErrorCode(
    () => applyTrial(db, lifecycle.tenantId, lifecycle.employeeId, crypto.randomUUID()),
    "SERVICE_TRIAL_APPLICATION_PENDING",
  );

  const startsAt = new Date(Date.now() + 60 * 60 * 1000);
  const reviewed = await reviewTrial(db, {
    trialId: String(applied.trial_id),
    actorId: fixture.platformAdminId,
    expectedVersion: 1,
    startsAt,
  });
  const scheduledAccessFacts = await readAccessFacts(db, lifecycle.tenantId);
  const snapshots = await Promise.all([
    effectiveStatusAt(db, String(applied.trial_id), new Date(startsAt.getTime() - 1_000)),
    effectiveStatusAt(db, String(applied.trial_id), new Date(startsAt.getTime() + 1_000)),
    effectiveStatusAt(db, String(applied.trial_id), new Date(startsAt.getTime() + 86_401_000)),
    effectiveStatusAt(db, String(applied.trial_id), new Date(startsAt.getTime() + 172_801_000)),
  ]);
  const expectedVersion = await hasErrorCode(
    () => assignTrial(db, String(applied.trial_id), fixture.platformAdminId, 99),
    "SERVICE_TRIAL_VERSION_CONFLICT",
  );
  await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_normalize_effective_status(
      ${String(applied.trial_id)}::uuid, ${lifecycle.tenantId}::uuid,
      ${new Date(startsAt.getTime() + 172_801_000).toISOString()}::timestamptz
    ) as result;
  `;
  const expiredAccessFacts = await readAccessFacts(db, lifecycle.tenantId);
  const repeatBlocked = await hasErrorCode(
    () => applyTrial(db, lifecycle.tenantId, lifecycle.employeeId, crypto.randomUUID()),
    "SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE",
  );

  const cooldown = fixture.tenants.cooldown;
  const cooldownApplied = await applyTrial(
    db, cooldown.tenantId, cooldown.employeeId, crypto.randomUUID(),
  );
  await rejectTrial(db, String(cooldownApplied.trial_id), fixture.platformAdminId);
  const cooldownBlocked = await hasErrorCode(
    () => applyTrial(db, cooldown.tenantId, cooldown.employeeId, crypto.randomUUID()),
    "SERVICE_TRIAL_REAPPLY_COOLDOWN",
  );

  const duplicateA = fixture.tenants.duplicateA;
  const duplicateGrant = await grantTrial(db, {
    tenantId: duplicateA.tenantId,
    actorId: fixture.platformAdminId,
    key: crypto.randomUUID(),
    scope: PROJECT_SCOPE,
  });
  const duplicateBlocked = await hasErrorCode(
    () => grantTrial(db, {
      tenantId: fixture.tenants.duplicateB.tenantId,
      actorId: fixture.platformAdminId,
      key: crypto.randomUUID(),
      scope: PROJECT_SCOPE,
    }),
    "SERVICE_TRIAL_ACTIVE_EXISTS",
  );

  const grantTenant = fixture.tenants.grant;
  const grantKey = crypto.randomUUID();
  const scheduledGrant = await grantTrial(db, {
    tenantId: grantTenant.tenantId,
    actorId: fixture.platformAdminId,
    key: grantKey,
    startsAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  const grantReplay = await grantTrial(db, {
    tenantId: grantTenant.tenantId,
    actorId: fixture.platformAdminId,
    key: grantKey,
    startsAt: new Date(String((scheduledGrant.trial_snapshot as SmokeJson).starts_at)),
  });
  const grantConflict = await hasErrorCode(
    () => grantTrial(db, {
      tenantId: grantTenant.tenantId,
      actorId: fixture.platformAdminId,
      key: grantKey,
      startsAt: new Date(String((scheduledGrant.trial_snapshot as SmokeJson).starts_at)),
      reason: "changed",
    }),
    "SERVICE_TRIAL_IDEMPOTENCY_CONFLICT",
  );
  const crossResourceConflict = await hasErrorCode(
    () => revokeTrial(
      db, String(scheduledGrant.trial_id), fixture.platformAdminId,
      Number(scheduledGrant.version), grantKey,
    ),
    "SERVICE_TRIAL_IDEMPOTENCY_CONFLICT",
  );
  await revokeTrial(
    db, String(scheduledGrant.trial_id), fixture.platformAdminId,
    Number(scheduledGrant.version),
  );

  const permissionBoundary = await verifyPermissionBoundary(db, fixture, grantTenant.tenantId);

  const extendTenant = fixture.tenants.extend;
  const extendGrant = await grantTrial(db, {
    tenantId: extendTenant.tenantId,
    actorId: fixture.platformAdminId,
    key: crypto.randomUUID(),
  });
  const wrongExtend = await hasErrorCode(
    () => extendTrial(db, String(extendGrant.trial_id), fixture.platformAdminId, 99),
    "SERVICE_TRIAL_VERSION_CONFLICT",
  );
  const extended = await extendTrial(
    db, String(extendGrant.trial_id), fixture.platformAdminId,
    Number(extendGrant.version),
  );
  const revoked = await revokeTrial(
    db, String(extendGrant.trial_id), fixture.platformAdminId,
    Number(extended.version),
  );

  const clockAndList = await verifyClockAndList(db);
  return {
    apply_pending: applyPending,
    application_replay: replay.idempotent === true
      && replay.trial_id === applied.trial_id
      && replay.version === applied.version
      && JSON.stringify(replay.trial_snapshot) === JSON.stringify(applied.trial_snapshot)
      && replayConflict && pendingConflict,
    application_repeat_cooldown: repeatBlocked && cooldownBlocked,
    review_scheduled_active_grace_expired:
      reviewed.status === "scheduled"
      && pendingAccessFacts.latestTrial?.status === "pending_review"
      && scheduledAccessFacts.latestTrial?.status === "scheduled"
      && expiredAccessFacts.latestTrial?.status === "expired"
      && JSON.stringify(snapshots) === JSON.stringify([
        "scheduled", "active", "grace_period", "expired",
      ]),
    grant_replay_conflict:
      grantReplay.idempotent === true
      && grantReplay.trial_id === scheduledGrant.trial_id
      && grantReplay.version === scheduledGrant.version
      && JSON.stringify(grantReplay.trial_snapshot)
        === JSON.stringify(scheduledGrant.trial_snapshot)
      && grantConflict && crossResourceConflict,
    expected_version: expectedVersion && wrongExtend,
    enterprise_cross_tenant_duplicate: duplicateGrant.status === "active" && duplicateBlocked,
    extend_revoke: extended.status === "active"
      && Number((extended.trial_snapshot as SmokeJson).extension_count) === 1
      && revoked.status === "revoked",
    permission_override_actor_revocation: permissionBoundary,
    database_clock: clockAndList.databaseClock,
    effective_list_count_privacy: clockAndList.effectiveList,
  };
}

async function applyTrial(
  db: TrialSql,
  tenantId: string,
  actorId: string,
  key: string,
  reason = "Task8 local application",
): Promise<SmokeJson> {
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_apply(
      ${tenantId}::uuid, ${actorId}::uuid, ${reason}, 10, 3,
      'Local Contact', '13800000000', ${key}::uuid
    ) as result;
  `;
  return requireResult(rows);
}

async function reviewTrial(db: TrialSql, input: {
  trialId: string;
  actorId: string;
  expectedVersion: number;
  startsAt: Date;
}): Promise<SmokeJson> {
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_review(
      ${input.trialId}::uuid, ${input.actorId}::uuid, 'approved',
      ${input.expectedVersion}, ${crypto.randomUUID()}::uuid, 'Task8 approved',
      'standard', ${PROJECT_SCOPE}::jsonb, 1, 1,
      ${input.startsAt.toISOString()}::timestamptz, null, false
    ) as result;
  `;
  return requireResult(rows);
}

async function rejectTrial(db: TrialSql, trialId: string, actorId: string): Promise<void> {
  await db`
    select public.platform_service_trial_review(
      ${trialId}::uuid, ${actorId}::uuid, 'rejected', 1,
      ${crypto.randomUUID()}::uuid, 'Task8 rejected'
    );
  `;
}

async function grantTrial(db: TrialSql, input: {
  tenantId: string;
  actorId: string;
  key: string;
  scope?: typeof PROJECT_SCOPE;
  startsAt?: Date;
  reason?: string;
  allowOverride?: boolean;
}): Promise<SmokeJson> {
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_grant(
      ${input.tenantId}::uuid, ${input.actorId}::uuid, 'standard',
      ${input.scope ?? PROJECT_SCOPE}::jsonb,
      ${input.reason ?? "Task8 local grant"}, ${input.key}::uuid,
      2, 1, ${input.startsAt?.toISOString() ?? null}::timestamptz,
      null, ${input.allowOverride ?? false}
    ) as result;
  `;
  return requireResult(rows);
}

async function extendTrial(
  db: TrialSql,
  trialId: string,
  actorId: string,
  version: number,
): Promise<SmokeJson> {
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_extend(
      ${trialId}::uuid, ${actorId}::uuid, ${version},
      ${crypto.randomUUID()}::uuid, 1, 'Task8 extend', false
    ) as result;
  `;
  return requireResult(rows);
}

async function revokeTrial(
  db: TrialSql,
  trialId: string,
  actorId: string,
  version: number,
  key = crypto.randomUUID(),
): Promise<SmokeJson> {
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_revoke(
      ${trialId}::uuid, ${actorId}::uuid, ${version},
      ${key}::uuid, 'Task8 revoke'
    ) as result;
  `;
  return requireResult(rows);
}

async function assignTrial(
  db: TrialSql,
  trialId: string,
  actorId: string,
  version: number,
): Promise<void> {
  await db`
    select public.platform_service_trial_assign(
      ${trialId}::uuid, ${actorId}::uuid, ${version},
      ${crypto.randomUUID()}::uuid, null
    );
  `;
}

async function effectiveStatusAt(
  db: TrialSql,
  trialId: string,
  now: Date,
): Promise<string | null> {
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_list(
      null, true, 1, 100, null, null, null, null, null, null, null, null, null,
      ${now.toISOString()}::timestamptz
    ) as result;
  `;
  const items = requireResult(rows).items as Array<SmokeJson>;
  return String(items.find((item) =>
    String((item.trial as SmokeJson).id) === trialId
  )?.effective_status ?? "") || null;
}

async function verifyPermissionBoundary(
  db: TrialSql,
  fixture: PlatformServiceTrialFixture,
  tenantId: string,
): Promise<boolean> {
  const actor = fixture.operationsActorId;
  const withoutOverride = await hasErrorCode(
    () => grantTrial(db, {
      tenantId, actorId: actor, key: crypto.randomUUID(), allowOverride: true,
    }),
    "SERVICE_TRIAL_ACTION_NOT_ALLOWED",
  );
  await db`
    insert into public.employee_permission_overrides (
      employee_id, permission_id, effect, access_scope, reason
    ) select ${actor}::uuid, id, 'allow', 'all', 'Task8 local'
      from public.permissions where code = 'platform.service_trial.override';
  `;
  const granted = await grantTrial(db, {
    tenantId, actorId: actor, key: crypto.randomUUID(), allowOverride: true,
  });
  await db`
    insert into public.employee_permission_overrides (
      employee_id, permission_id, effect, access_scope, reason
    ) select ${actor}::uuid, id, 'deny', 'all', 'Task8 local'
      from public.permissions where code = 'platform.service_trial.manage';
  `;
  const denied = await hasErrorCode(
    () => revokeTrial(db, String(granted.trial_id), actor, Number(granted.version)),
    "SERVICE_TRIAL_ACTION_NOT_ALLOWED",
  );
  await db`delete from public.employee_permission_overrides
    where employee_id = ${actor}::uuid and effect = 'deny'`;
  await db`update public.employees set status = 'suspended' where id = ${actor}::uuid`;
  const revokedActor = await hasErrorCode(
    () => revokeTrial(db, String(granted.trial_id), actor, Number(granted.version)),
    "SERVICE_TRIAL_ACTION_NOT_ALLOWED",
  );
  await db`update public.employees set status = 'active' where id = ${actor}::uuid`;
  return withoutOverride && granted.status === "active" && denied && revokedActor;
}

async function verifyClockAndList(db: TrialSql): Promise<{
  databaseClock: boolean;
  effectiveList: boolean;
}> {
  const before = Date.now();
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_list(
      null, true, 1, 100, null, null, null, null, null, null, null, null, null,
      clock_timestamp()
    ) as result;
  `;
  const after = Date.now();
  const result = requireResult(rows);
  const items = result.items as Array<SmokeJson>;
  const counts = await db<Array<{ count: number }>>`
    select count(*)::int as count from public.tenant_service_trials;
  `;
  const serialized = JSON.stringify(items);
  const serverTime = Date.parse(String(result.server_time));
  return {
    databaseClock: serverTime >= before - 2_000 && serverTime <= after + 2_000,
    effectiveList: Number(result.total) === counts[0]?.count
      && items.length === counts[0]?.count
      && !serialized.includes("enterprise_identity_hash")
      && !serialized.includes("13800000000")
      && serialized.includes("138****0000"),
  };
}

export async function verifyAccessDecisions(
  db: TrialSql,
  tenantId: string,
): Promise<boolean> {
  const { TenantServiceAccessService } = await import("../services/tenant-service-access");
  const { EmployeeServiceAccessService } = await import("../services/employee-service-access");
  const repository = { getAccessFacts: async () => readAccessFacts(db, tenantId) };
  const service = new TenantServiceAccessService({
    repository,
    trialAccessEnabled: async () => true,
  });
  const employeeService = new EmployeeServiceAccessService({
    repository,
    trialAccessEnabled: async () => true,
    trialApplicationEnabled: async () => false,
  });
  const included = await service.resolveForRoute({
    tenantId, routeAccess: "write", requiredCapability: "core.projects",
  });
  const excluded = await service.resolveForRoute({
    tenantId, routeAccess: "write", requiredCapability: "core.customers",
  });
  const employeeActive = await employeeService.resolve({
    tenantId, permissionCodes: [],
  });
  const trialRows = await db<Array<{ id: string }>>`
    update public.tenant_service_trials set status = 'active',
      starts_at = clock_timestamp() - interval '2 days',
      activated_at = clock_timestamp() - interval '2 days',
      trial_ends_at = clock_timestamp() - interval '1 day',
      grace_ends_at = clock_timestamp() + interval '1 day', version = version + 1
    where tenant_id = ${tenantId}::uuid returning id;
  `;
  const graceRead = await service.resolveForRoute({
    tenantId, routeAccess: "read", requiredCapability: "core.projects",
  });
  const graceWrite = await service.resolveForRoute({
    tenantId, routeAccess: "write", requiredCapability: "core.projects",
  });
  const employeeGrace = await employeeService.resolve({
    tenantId, permissionCodes: [],
  });
  return trialRows.length === 1 && included.allowed && !excluded.allowed
    && excluded.errorCode === "TENANT_SERVICE_CAPABILITY_NOT_INCLUDED"
    && graceRead.allowed && !graceWrite.allowed
    && graceWrite.errorCode === "TENANT_SERVICE_READ_ONLY"
    && employeeActive.access_status === "workspace_available"
    && employeeGrace.access_status === "grace_period"
    && employeeActive.trial_id === employeeGrace.trial_id;
}

export async function readAccessFacts(
  db: TrialSql,
  tenantId: string,
): Promise<TenantServiceAccessFacts> {
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_trial_access_facts(${tenantId}::uuid) as result;
  `;
  const fact = requireResult(rows);
  return {
    evaluatedAt: String(fact.server_time),
    tenantStatus: fact.tenant_status == null ? null : String(fact.tenant_status),
    contract: fact.contract as TenantServiceAccessFacts["contract"],
    paidOnboardingOrder:
      fact.paid_onboarding_order as TenantServiceAccessFacts["paidOnboardingOrder"],
    legacySubscriptionStatus:
      fact.legacy_subscription_status as TenantServiceAccessFacts["legacySubscriptionStatus"],
    currentTrial: fact.current_trial as TenantServiceAccessFacts["currentTrial"],
    latestTrial: (fact.latest_trial ?? null) as TenantServiceAccessFacts["latestTrial"],
  };
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
