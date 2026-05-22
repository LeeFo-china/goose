-- 修复项目已签约/进入交付但关联客户仍停留在 designing 的历史数据。
-- 日期：2026-05-22
--
-- 幂等规则：
-- - 只处理当前仍为 designing 的客户。
-- - 修复后客户进入 signed。
-- - 同一客户只按最新一个已签约/交付项目补一条 mark_signed 日志。

begin;

with signed_candidates as (
  select distinct on (c.id)
    c.id as customer_id,
    c.tenant_id,
    c.status as from_status,
    p.id as project_id,
    p.status as project_status
  from public.projects p
  join public.customers c
    on c.id = p.customer_id
   and c.tenant_id = p.tenant_id
  where p.status in (
      'signed',
      'design_finalized',
      'pending_start',
      'started',
      'constructing',
      'acceptance'
    )
    and c.status = 'designing'
  order by c.id, p.created_at desc
),
inserted_logs as (
  insert into public.customer_status_transition_logs (
    tenant_id,
    customer_id,
    from_status,
    to_status,
    action,
    operator_employee_id,
    operator_auth_user_id,
    reason,
    metadata
  )
  select
    tenant_id,
    customer_id,
    from_status,
    'signed',
    'mark_signed',
    null,
    null,
    null,
    jsonb_build_object(
      'source', 'data_consistency_repair',
      'project_id', project_id,
      'project_status', project_status
    )
  from signed_candidates
  returning customer_id
),
updated_customers as (
  update public.customers c
  set status = 'signed'
  from signed_candidates sc
  where c.id = sc.customer_id
    and c.tenant_id = sc.tenant_id
  returning c.id
)
select
  (select count(*) from inserted_logs) as inserted_transition_logs,
  (select count(*) from updated_customers) as updated_customers;

commit;
