begin;

set local timezone = 'UTC';

insert into public.tenants (id, slug, name, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'project-health-a', '风险中心测试租户 A', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'project-health-b', '风险中心测试租户 B', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'project-health-empty', '风险中心空租户', 'active');

insert into public.employees (id, tenant_id, name, status)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '项目经理甲', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '施工负责人乙', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '客服负责人丙', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '其他租户员工', 'active');

insert into public.customers (id, tenant_id, name, phone, source, status, owner_id)
values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '湖畔业主', '13900000001', 'referral', 'designing', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '其他业主', '13900000002', 'referral', 'designing', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4');

insert into public.projects (id, tenant_id, customer_id, name, status, created_at)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '湖畔项目', 'constructing', statement_timestamp() - interval '20 days'),
  ('11111111-1111-4111-8111-111111111112', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '星河项目', 'started', statement_timestamp() - interval '12 days'),
  ('11111111-1111-4111-8111-111111111113', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '无效项目', 'invalid', statement_timestamp() - interval '12 days'),
  ('11111111-1111-4111-8111-111111111114', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', '其他租户项目', 'constructing', statement_timestamp() - interval '12 days');

insert into public.workflow_definitions (id, tenant_id, workflow_key, name, category, status, created_by, updated_by)
values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'project_health_fixture', '风险中心测试流程', 'construction', 'active', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'project_health_fixture', '其他租户测试流程', 'construction', 'active', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4');

insert into public.workflow_versions (id, tenant_id, definition_id, version_number, status, snapshot, validation_result, published_by)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 1, 'published', '{"nodes":[],"edges":[]}'::jsonb, '{}'::jsonb, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'dddddddd-dddd-4ddd-8ddd-dddddddddd02', 1, 'published', '{"nodes":[],"edges":[]}'::jsonb, '{}'::jsonb, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4');

update public.workflow_definitions
set active_version_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'
where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';

update public.workflow_definitions
set active_version_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'
where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02';

insert into public.workflow_instances (
  id, tenant_id, definition_id, version_id, subject_type, subject_id, status, context
)
values
  ('ffffffff-ffff-4fff-8fff-ffffffffff01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'project', '11111111-1111-4111-8111-111111111111', 'running', '{}'::jsonb),
  ('ffffffff-ffff-4fff-8fff-ffffffffff02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'project', '11111111-1111-4111-8111-111111111112', 'running', '{}'::jsonb),
  ('ffffffff-ffff-4fff-8fff-ffffffffff03', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'project', '11111111-1111-4111-8111-111111111113', 'running', '{}'::jsonb),
  ('ffffffff-ffff-4fff-8fff-ffffffffff04', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'project', '11111111-1111-4111-8111-111111111114', 'running', '{}'::jsonb);

insert into public.workflow_tasks (
  id, tenant_id, instance_id, definition_id, version_id, node_id, node_key,
  node_type, title, status, assignee_employee_id, due_at
)
values
  ('12121212-1212-4121-8121-121212121201', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'ffffffff-ffff-4fff-8fff-ffffffffff01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'aaaaaaaa-0000-4000-8000-000000000001', 'confirm_node', 'confirmation', '确认水电节点', 'pending', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', statement_timestamp() - interval '2 days'),
  ('12121212-1212-4121-8121-121212121202', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'ffffffff-ffff-4fff-8fff-ffffffffff01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'aaaaaaaa-0000-4000-8000-000000000002', 'accept_node', 'confirmation', '确认瓦工节点', 'pending', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', statement_timestamp() - interval '3 days'),
  ('12121212-1212-4121-8121-121212121203', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'ffffffff-ffff-4fff-8fff-ffffffffff01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'aaaaaaaa-0000-4000-8000-000000000003', 'missing_due_node', 'confirmation', '缺少到期时间', 'pending', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', null),
  ('12121212-1212-4121-8121-121212121204', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'ffffffff-ffff-4fff-8fff-ffffffffff03', 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'aaaaaaaa-0000-4000-8000-000000000004', 'invalid_project_node', 'confirmation', '无效项目任务', 'pending', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', statement_timestamp() - interval '5 days'),
  ('12121212-1212-4121-8121-121212121205', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'ffffffff-ffff-4fff-8fff-ffffffffff04', 'dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'aaaaaaaa-0000-4000-8000-000000000005', 'other_tenant_node', 'confirmation', '其他租户任务', 'pending', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', statement_timestamp() - interval '5 days');

insert into public.project_procedure_assignments (
  id, tenant_id, project_id, workflow_instance_id, node_key, stage_code,
  assignee_employee_id, planned_start_date, planned_duration_days, status, started_at
)
values
  ('13131313-1313-4131-8131-131313131301', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'ffffffff-ffff-4fff-8fff-ffffffffff01', 'procedure_plumbing', 'plumbing_electrical', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', (statement_timestamp()::date - 5), 4, 'in_progress', statement_timestamp() - interval '5 days'),
  ('13131313-1313-4131-8131-131313131302', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111112', 'ffffffff-ffff-4fff-8fff-ffffffffff02', 'procedure_tiling', 'tiling', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', (statement_timestamp()::date - 5), 3, 'planned', statement_timestamp() - interval '5 days');

insert into public.project_logs (id, tenant_id, project_id, employee_id, node_name, stage_code, content, images, created_at)
values
  ('14141414-1414-4141-8141-141414141401', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '历史日志', 'plumbing_electrical', '48 小时前日志', '[]'::jsonb, statement_timestamp() - interval '3 days');

insert into public.project_acceptances (
  id, tenant_id, project_id, stage_code, title, status, acceptance_type,
  initiator_id, reviewer_id, customer_id, rejected_at, reject_source
)
values (
  '15151515-1515-4151-8151-151515151501',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '11111111-1111-4111-8111-111111111111',
  'tiling',
  '瓦工验收',
  'rejected',
  'stage',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  statement_timestamp() - interval '1 day',
  'leader'
);

insert into public.customer_service_tickets (
  id, tenant_id, ticket_no, customer_id, project_id, category, title,
  content, images, status, priority, assigned_employee_id, created_at
)
values
  ('16161616-1616-4161-8161-161616161601', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'PH-001', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '11111111-1111-4111-8111-111111111111', 'construction', '高优先级未超时', '完整投诉内容不得出现在 evidence', '[]'::jsonb, 'open', 'high', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', statement_timestamp() - interval '12 hours'),
  ('16161616-1616-4161-8161-161616161602', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'PH-002', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '11111111-1111-4111-8111-111111111111', 'construction', '高优先级超时', '完整投诉内容不得出现在 evidence', '[]'::jsonb, 'in_progress', 'high', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', statement_timestamp() - interval '60 hours'),
  ('16161616-1616-4161-8161-161616161603', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'PH-003', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '11111111-1111-4111-8111-111111111112', 'acceptance', '紧急工单', '完整投诉内容不得出现在 evidence', '[]'::jsonb, 'open', 'urgent', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', statement_timestamp() - interval '1 hour');

do $$
declare
  result jsonb;
  local_tz text;
begin
  select name
    into local_tz
  from pg_timezone_names
  where extract(hour from timezone(name, statement_timestamp())) >= 18
  order by utc_offset desc, name
  limit 1;

  if local_tz is null then
    raise exception 'project health: no timezone can trigger after-18 log rule';
  end if;

  select public.get_project_operational_risk_page(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    1,
    20,
    null,
    null,
    null,
    local_tz
  ) into result;

  if (result->'summary'->>'total')::integer < 9 then
    raise exception 'project health: default summary should include all seeded risk families';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(result->'items') as item
    where item->>'risk_key' like 'workflow_task_overdue:%'
      and item->>'severity' = 'danger'
  ) then
    raise exception 'project health: workflow 3-day boundary';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(result->'items') as item
    where item->>'risk_key' like 'procedure_overdue:%'
  ) then
    raise exception 'project health: procedure overdue risk missing';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(result->'items') as item
    where item->>'risk_key' like 'missing_project_log:%'
  ) then
    raise exception 'project health: missing project log risk missing';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(result->'items') as item
    where item->>'risk_key' like 'acceptance_rework:%'
  ) then
    raise exception 'project health: acceptance rework risk missing';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(result->'items') as item
    where item->>'risk_key' like 'service_ticket:%'
  ) then
    raise exception 'project health: service ticket risk missing';
  end if;

  if (result->'diagnostics'->>'workflow_tasks_missing_due_at')::integer <> 1 then
    raise exception 'project health: workflow missing due diagnostic';
  end if;

  if exists (
    select 1 from jsonb_array_elements(result->'items') as item
    where item->>'project_id' in (
      '11111111-1111-4111-8111-111111111113',
      '11111111-1111-4111-8111-111111111114'
    )
  ) then
    raise exception 'project health: invalid or cross-tenant project leaked';
  end if;

  if result::text like '%完整投诉内容不得出现在 evidence%' then
    raise exception 'project health: service ticket content leaked';
  end if;
end $$;

do $$
declare
  result jsonb;
begin
  select public.get_project_operational_risk_page(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    1,
    101,
    'service_ticket',
    'danger',
    '湖畔',
    'Asia/Shanghai'
  ) into result;

  if (result->'pagination'->>'page_size')::integer <> 100 then
    raise exception 'project health: page size cap';
  end if;

  if (result->'summary'->'by_type'->>'service_ticket')::integer < 1 then
    raise exception 'project health: service ticket filter';
  end if;

  if exists (
    select 1 from jsonb_array_elements(result->'items') as item
    where item->>'risk_type' <> 'service_ticket'
       or item->>'severity' <> 'danger'
       or item->>'project_name' not ilike '%湖畔%'
  ) then
    raise exception 'project health: filtered items mismatch';
  end if;
end $$;

do $$
declare
  result jsonb;
begin
  select public.get_project_operational_risk_page(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    1,
    20,
    null,
    null,
    '11111111-1111-4111-8111-111111111112',
    'Asia/Shanghai'
  ) into result;

  if (result->'summary'->>'total')::integer = 0
    or jsonb_array_length(result->'items') = 0 then
    raise exception 'project health: project id keyword filter should match';
  end if;

  if exists (
    select 1 from jsonb_array_elements(result->'items') as item
    where item->>'project_id' <> '11111111-1111-4111-8111-111111111112'
  ) then
    raise exception 'project health: project id keyword filter';
  end if;
end $$;

update public.workflow_tasks
set status = 'completed', completed_at = statement_timestamp()
where id in (
  '12121212-1212-4121-8121-121212121201',
  '12121212-1212-4121-8121-121212121202'
);

update public.project_acceptances
set status = 'submitted'
where id = '15151515-1515-4151-8151-151515151501';

update public.customer_service_tickets
set status = 'resolved', resolved_at = statement_timestamp()
where id in (
  '16161616-1616-4161-8161-161616161601',
  '16161616-1616-4161-8161-161616161602',
  '16161616-1616-4161-8161-161616161603'
);

insert into public.project_logs (id, tenant_id, project_id, employee_id, node_name, stage_code, content, images, created_at)
values
  ('14141414-1414-4141-8141-141414141402', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '今日日志', 'plumbing_electrical', '今天已补日志', '[]'::jsonb, statement_timestamp()),
  ('14141414-1414-4141-8141-141414141403', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111112', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '今日日志', 'tiling', '今天已补日志', '[]'::jsonb, statement_timestamp());

do $$
declare
  result jsonb;
  local_tz text;
begin
  select name
    into local_tz
  from pg_timezone_names
  where extract(hour from timezone(name, statement_timestamp())) >= 18
  order by utc_offset desc, name
  limit 1;

  select public.get_project_operational_risk_page(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    1,
    20,
    null,
    null,
    null,
    local_tz
  ) into result;

  if exists (
    select 1 from jsonb_array_elements(result->'items') as item
    where item->>'risk_type' in (
      'workflow_task_overdue',
      'missing_project_log',
      'acceptance_rework',
      'service_ticket'
    )
  ) then
    raise exception 'project health: resolved facts should disappear';
  end if;
end $$;

do $$
declare
  result jsonb;
begin
  select public.get_project_operational_risk_page(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    1,
    20,
    null,
    null,
    null,
    'Asia/Shanghai'
  ) into result;

  if (result->'summary'->>'total')::integer <> 0 then
    raise exception 'project health: empty tenant summary';
  end if;

  if jsonb_array_length(result->'items') <> 0 then
    raise exception 'project health: empty tenant items';
  end if;

  if result->'summary'->'by_type' is null
    or result->'diagnostics' is null
    or result->'pagination' is null then
    raise exception 'project health: empty tenant full contract';
  end if;
end $$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.get_project_operational_risk_page(uuid,integer,integer,text,text,text,text)',
    'execute'
  ) then
    raise exception 'project health: authenticated execute privilege should be revoked';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.get_project_operational_risk_page(uuid,integer,integer,text,text,text,text)',
    'execute'
  ) then
    raise exception 'project health: service_role execute privilege missing';
  end if;
end $$;

rollback;
