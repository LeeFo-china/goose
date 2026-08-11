begin;

set local timezone = 'UTC';

insert into public.tenants (id, slug, name, status)
values ('71000000-0000-4000-8000-000000000001',
  'service-trial-core-smoke', '试用真实约束测试企业', 'active');

insert into public.employees (id, tenant_id, name, phone, status)
values ('72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001', '试用跟进人', '13900139000', 'active');

insert into public.tenant_service_trials (
  id, tenant_id, enterprise_identity_hash, source, trial_type, status,
  grant_reason, granted_at, granted_by_employee_id, starts_at, activated_at,
  trial_ends_at, grace_ends_at, assignee_employee_id, scope_snapshot,
  policy_snapshot, created_at, updated_at
) values
  ('73000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    extensions.digest('service-trial-matured-scheduled', 'sha256'),
    'platform_grant', 'standard', 'scheduled', '真实筛选测试',
    '2026-08-09T00:00:00Z', '72000000-0000-4000-8000-000000000001',
    '2026-08-11T07:00:00Z', null, '2026-09-10T07:00:00Z',
    '2026-09-17T07:00:00Z', '72000000-0000-4000-8000-000000000001',
    '{"version":1,"capabilities":["core.projects"]}'::jsonb,
    '{"policy_id":"74000000-0000-4000-8000-000000000001","version":1,"trial_days":30,"grace_days":7,"max_trial_days":60,"max_grace_days":14,"max_schedule_days":30,"max_extension_count":1,"max_extension_days":30,"reapply_cooldown_days":30,"allow_repeat":false,"reminder_days":[7,3,1],"override_used":false}'::jsonb,
    '2026-08-09T00:00:00Z', '2026-08-09T00:00:00Z'),
  ('73000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    extensions.digest('service-trial-stale-active', 'sha256'),
    'platform_grant', 'standard', 'active', '真实筛选测试',
    '2026-07-01T00:00:00Z', '72000000-0000-4000-8000-000000000001',
    '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z',
    '2026-07-31T00:00:00Z', '2026-08-07T00:00:00Z', null,
    '{"version":1,"capabilities":["core.projects"]}'::jsonb,
    '{"policy_id":"74000000-0000-4000-8000-000000000001","version":1,"trial_days":30,"grace_days":7,"max_trial_days":60,"max_grace_days":14,"max_schedule_days":30,"max_extension_count":1,"max_extension_days":30,"reapply_cooldown_days":30,"allow_repeat":false,"reminder_days":[7,3,1],"override_used":false}'::jsonb,
    '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z');

insert into public.tenant_service_trials (
  id, tenant_id, enterprise_identity_hash, source, trial_type, status,
  application_reason, expected_user_count, expected_project_count,
  contact_name, contact_phone, requested_at, requested_by_employee_id,
  review_decision, review_reason, reviewed_at, reviewed_by_employee_id,
  scope_snapshot, policy_snapshot, created_at, updated_at
) values (
  '73000000-0000-4000-8000-000000000003',
  '71000000-0000-4000-8000-000000000001',
  extensions.digest('service-trial-rejected', 'sha256'),
  'tenant_application', 'standard', 'rejected', '验证真实约束', 3, 2,
  '张经理', '13800138000', '2026-08-10T00:00:00Z',
  '72000000-0000-4000-8000-000000000001', 'rejected', '不符合规则',
  '2026-08-10T01:00:00Z', '72000000-0000-4000-8000-000000000001',
  '{"version":1,"capabilities":["core.projects"]}'::jsonb,
  '{"policy_id":"74000000-0000-4000-8000-000000000001","version":1,"trial_days":30,"grace_days":7,"max_trial_days":60,"max_grace_days":14,"max_schedule_days":30,"max_extension_count":1,"max_extension_days":30,"reapply_cooldown_days":30,"allow_repeat":false,"reminder_days":[7,3,1]}'::jsonb,
  '2026-08-10T00:00:00Z', '2026-08-10T01:00:00Z'
);

do $$
declare
  active_page jsonb;
  expired_page jsonb;
  all_page jsonb;
begin
  active_page := public.platform_service_trial_list(
    p_platform => true, p_status => 'active',
    p_now => '2026-08-11T08:00:00Z'
  );
  if (active_page->>'total')::integer <> 1
    or active_page->'items'->0->>'effective_status' <> 'active'
    or active_page->'items'->0->'trial'->>'id'
      <> '73000000-0000-4000-8000-000000000001'
  then raise exception 'service trial: matured scheduled effective filter failed'; end if;

  expired_page := public.platform_service_trial_list(
    p_platform => true, p_status => 'expired',
    p_now => '2026-08-11T08:00:00Z'
  );
  if (expired_page->>'total')::integer <> 1
    or expired_page->'items'->0->'trial'->>'id'
      <> '73000000-0000-4000-8000-000000000002'
  then raise exception 'service trial: stale active effective filter failed'; end if;

  all_page := public.platform_service_trial_list(
    p_platform => true, p_now => '2026-08-11T08:00:00Z'
  );
  if all_page::text like '%13800138000%'
    or all_page::text like '%13900139000%'
    or all_page::text like '%enterprise_identity_hash%'
    or all_page::text not like '%138****8000%'
    or all_page::text not like '%139****9000%'
  then raise exception 'service trial: list projection leaked private facts'; end if;

  begin
    update public.tenant_service_trials set
      granted_at = '2026-08-10T01:00:00Z',
      granted_by_employee_id = '72000000-0000-4000-8000-000000000001',
      starts_at = '2026-08-10T01:00:00Z',
      trial_ends_at = '2026-09-09T01:00:00Z',
      grace_ends_at = '2026-09-16T01:00:00Z',
      policy_snapshot = policy_snapshot || '{"override_used":false}'::jsonb
    where id = '73000000-0000-4000-8000-000000000003';
    raise exception 'service trial: rejected row accepted grant facts';
  exception when check_violation then null;
  end;

  begin
    update public.tenant_service_trials set
      withdrawn_at = '2026-08-11T08:00:00Z',
      withdrawn_by_employee_id = '72000000-0000-4000-8000-000000000001',
      withdraw_reason = '矛盾事实'
    where id = '73000000-0000-4000-8000-000000000002';
    raise exception 'service trial: active row accepted withdrawal facts';
  exception when check_violation then null;
  end;
end $$;

rollback;
