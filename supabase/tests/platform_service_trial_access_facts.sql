begin;

set local timezone = 'UTC';

insert into public.tenants (id, slug, name, status)
values (
  '75000000-0000-4000-8000-000000000001',
  'service-trial-access-facts-smoke', '试用访问事实测试企业', 'active'
);

insert into public.employees (id, tenant_id, name, status)
values (
  '76000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001', '试用访问事实测试员工', 'active'
);

insert into public.tenant_service_trials (
  id, tenant_id, enterprise_identity_hash, source, trial_type, status,
  grant_reason, granted_at, granted_by_employee_id, starts_at,
  trial_ends_at, grace_ends_at, scope_snapshot, policy_snapshot
) values (
  '77000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  extensions.digest('service-trial-access-facts-smoke', 'sha256'),
  'platform_grant', 'standard', 'scheduled', '数据库时钟验证',
  clock_timestamp() - interval '2 minutes',
  '76000000-0000-4000-8000-000000000001',
  clock_timestamp() - interval '1 minute',
  clock_timestamp() + interval '1 minute',
  clock_timestamp() + interval '2 minutes',
  '{"version":1,"capabilities":["core.projects"]}'::jsonb,
  '{"override_used":false}'::jsonb
);

do $$
declare
  before_call timestamptz;
  after_call timestamptz;
  facts jsonb;
begin
  before_call := clock_timestamp();
  facts := public.platform_service_trial_access_facts(
    '75000000-0000-4000-8000-000000000001'
  );
  after_call := clock_timestamp();
  if (facts->>'server_time')::timestamptz not between before_call and after_call
    or facts->>'tenant_id' <> '75000000-0000-4000-8000-000000000001'
    or facts->'current_trial'->>'status' <> 'active'
  then raise exception 'service trial access: database active clock failed'; end if;

  update public.tenant_service_trials set
    status = 'grace_period', activated_at = clock_timestamp() - interval '1 minute',
    starts_at = clock_timestamp() - interval '2 minutes',
    trial_ends_at = clock_timestamp() - interval '1 minute',
    grace_ends_at = clock_timestamp() + interval '1 minute'
  where id = '77000000-0000-4000-8000-000000000001';

  facts := public.platform_service_trial_access_facts(
    '75000000-0000-4000-8000-000000000001'
  );
  if facts->'current_trial'->>'status' <> 'grace_period'
    or facts->'current_trial'->'scope_snapshot'->'capabilities'->>0
      <> 'core.projects'
  then raise exception 'service trial access: database grace clock failed'; end if;
end $$;

rollback;
