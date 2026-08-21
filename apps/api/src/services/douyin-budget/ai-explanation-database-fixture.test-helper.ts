import { randomInt, randomUUID } from 'node:crypto';

export type DatabaseSql = InstanceType<typeof Bun.SQL>;
export type DouyinBudgetAiDatabaseFixture = {
  runId: string;
  tenantId: string;
  employeeId: string;
  componentAppId: string;
  installationId: string;
  pricingVersionId: string;
  subjectHash: string;
  staleClaimedAt: string;
  estimates: {
    concurrent: string;
    live: string;
    stale: string;
    exhausted: string;
    failed: string;
  };
};

export async function createDouyinBudgetAiDatabaseFixture(
  admin: DatabaseSql,
): Promise<DouyinBudgetAiDatabaseFixture> {
  const runId = randomUUID().replaceAll('-', '');
  const fixture: DouyinBudgetAiDatabaseFixture = {
    runId,
    tenantId: randomUUID(),
    employeeId: randomUUID(),
    componentAppId: `component-ai-${runId}`,
    installationId: randomUUID(),
    pricingVersionId: randomUUID(),
    subjectHash: 'a'.repeat(32) + runId,
    staleClaimedAt: new Date(Date.now() - 120_000).toISOString(),
    estimates: {
      concurrent: randomUUID(),
      live: randomUUID(),
      stale: randomUUID(),
      exhausted: randomUUID(),
      failed: randomUUID(),
    },
  };
  const estimateNumbers = uniqueEstimateNumbers(5);

  await admin.begin(async (db) => {
    await db`
      insert into public.tenants (id, name, slug, status)
      values (
        ${fixture.tenantId}::uuid, '抖音预算 AI 本地集成租户',
        ${`douyin-budget-ai-${runId}`}, 'active'
      );
    `;
    await db`
      insert into public.employees (id, tenant_id, name, status)
      values (
        ${fixture.employeeId}::uuid, ${fixture.tenantId}::uuid,
        '抖音预算 AI 本地集成员工', 'active'
      );
    `;
    await db`
      insert into public.douyin_third_party_components (
        component_appid, status
      ) values (${fixture.componentAppId}, 'active');
    `;
    await db`
      insert into public.douyin_miniapp_installations (
        id, tenant_id, component_appid, authorizer_appid,
        deployment_key, installation_kind, authorization_status,
        refresh_token_ciphertext, refresh_token_iv, refresh_token_tag,
        refresh_token_key_version, refresh_token_expires_at
      ) values (
        ${fixture.installationId}::uuid, ${fixture.tenantId}::uuid,
        ${fixture.componentAppId}, ${`tt-ai-${runId}`}, ${`ai-${runId}`},
        'merchant', 'active', 'local-ciphertext', 'local-iv', 'local-tag',
        'local-key-v1', clock_timestamp() + interval '1 day'
      );
    `;
    await db`
      insert into public.douyin_budget_pricing_versions (
        id, tenant_id, version_no, status, effective_from, disclaimer,
        created_by_employee_id
      ) values (
        ${fixture.pricingVersionId}::uuid, ${fixture.tenantId}::uuid,
        1, 'active', clock_timestamp() - interval '1 day',
        '本地集成初算声明', ${fixture.employeeId}::uuid
      );
    `;
    const states = [
      { id: fixture.estimates.concurrent, status: 'pending', attempt: 0,
        claimedAt: null, errorCode: null },
      { id: fixture.estimates.live, status: 'pending', attempt: 1,
        claimedAt: new Date().toISOString(), errorCode: null },
      { id: fixture.estimates.stale, status: 'pending', attempt: 1,
        claimedAt: fixture.staleClaimedAt, errorCode: null },
      { id: fixture.estimates.exhausted, status: 'pending', attempt: 3,
        claimedAt: fixture.staleClaimedAt, errorCode: null },
      { id: fixture.estimates.failed, status: 'failed', attempt: 1,
        claimedAt: null, errorCode: 'DOUYIN_BUDGET_AI_GATEWAY_FAILED' },
    ] as const;
    for (const [index, state] of states.entries()) {
      await db`
        insert into public.douyin_budget_estimates (
          id, tenant_id, douyin_miniapp_installation_id, subject_hash,
          request_ip_hash, pricing_version_id, estimate_no, request_payload,
          result_payload, ai_status, ai_claimed_at, ai_attempt_count,
          ai_last_error_code, expires_at
        ) values (
          ${state.id}::uuid, ${fixture.tenantId}::uuid,
          ${fixture.installationId}::uuid, ${fixture.subjectHash},
          ${'b'.repeat(64)}, ${fixture.pricingVersionId}::uuid,
          ${estimateNumbers[index]}, '{}'::jsonb, '{}'::jsonb,
          ${state.status}, ${state.claimedAt}::timestamptz, ${state.attempt},
          ${state.errorCode}, clock_timestamp() + interval '1 day'
        );
      `;
    }
  });
  return fixture;
}

export async function cleanupDouyinBudgetAiDatabaseFixture(
  admin: DatabaseSql,
  fixture: DouyinBudgetAiDatabaseFixture,
): Promise<boolean> {
  await admin.begin(async (db) => {
    await db`set local session_replication_role = replica`;
    await db`delete from public.douyin_budget_estimates
      where tenant_id = ${fixture.tenantId}::uuid`;
    await db`delete from public.douyin_budget_pricing_versions
      where id = ${fixture.pricingVersionId}::uuid`;
    await db`delete from public.douyin_miniapp_installations
      where id = ${fixture.installationId}::uuid`;
    await db`delete from public.douyin_third_party_components
      where component_appid = ${fixture.componentAppId}`;
    await db`delete from public.employees where id = ${fixture.employeeId}::uuid`;
    await db`delete from public.tenants where id = ${fixture.tenantId}::uuid`;
  });
  const rows = await admin<Array<{ count: number }>>`
    select (
      (select count(*) from public.douyin_budget_estimates
        where tenant_id = ${fixture.tenantId}::uuid)
      + (select count(*) from public.douyin_budget_pricing_versions
        where id = ${fixture.pricingVersionId}::uuid)
      + (select count(*) from public.douyin_miniapp_installations
        where id = ${fixture.installationId}::uuid)
      + (select count(*) from public.douyin_third_party_components
        where component_appid = ${fixture.componentAppId})
      + (select count(*) from public.employees
        where id = ${fixture.employeeId}::uuid)
      + (select count(*) from public.tenants
        where id = ${fixture.tenantId}::uuid)
    )::int as count;
  `;
  return rows[0]?.count === 0;
}

function uniqueEstimateNumbers(count: number): string[] {
  const numbers = new Set<string>();
  while (numbers.size < count) {
    const datePart = String(randomInt(0, 100_000_000)).padStart(8, '0');
    const suffix = String(randomInt(0, 1_000_000)).padStart(6, '0');
    numbers.add(`DYYS-${datePart}-${suffix}`);
  }
  return [...numbers];
}
