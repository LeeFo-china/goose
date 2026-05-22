-- 状态机整改后历史数据一致性检查
-- 日期：2026-05-22
--
-- 默认查询不修改数据。建议先逐段执行检查 SQL，确认结果后再按需执行末尾修复 SQL。

-- 1. 客户是否仍存在旧状态或非法状态。
select
  id,
  tenant_id,
  name,
  phone,
  status,
  created_at
from public.customers
where status is not null
  and status not in (
    'potential',
    'following',
    'arrived',
    'designing',
    'signed',
    'dormant',
    'invalid'
  )
order by created_at desc;

-- 2. 项目是否仍存在旧工程流状态或非法状态。
select
  id,
  tenant_id,
  name,
  customer_id,
  property_id,
  status,
  created_at
from public.projects
where status is not null
  and status not in (
    'designing',
    'proposal_confirmed',
    'signed',
    'design_finalized',
    'pending_start',
    'started',
    'constructing',
    'on_hold',
    'acceptance',
    'invalid'
  )
order by created_at desc;

-- 3. 项目已签约或进入交付后，关联客户仍停留在 designing。
-- 这些数据应修正为客户 signed，并补一条 mark_signed 客户状态日志。
select
  p.id as project_id,
  p.tenant_id,
  p.name as project_name,
  p.status as project_status,
  p.signed_amount,
  p.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  c.status as customer_status,
  p.created_at as project_created_at
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
order by p.created_at desc;

-- 4. 项目准备签约或已签约后，关联客户不是 designing / signed。
-- proposal_confirmed 项目会被签约接口拦截；signed 及后续状态说明历史数据存在不一致。
select
  p.id as project_id,
  p.tenant_id,
  p.name as project_name,
  p.status as project_status,
  p.customer_id,
  c.name as customer_name,
  c.status as customer_status
from public.projects p
join public.customers c
  on c.id = p.customer_id
 and c.tenant_id = p.tenant_id
where p.status in (
    'proposal_confirmed',
    'signed',
    'design_finalized',
    'pending_start',
    'started',
    'constructing',
    'acceptance'
  )
  and coalesce(c.status, '') not in ('designing', 'signed')
order by p.created_at desc;

-- 5. 客户已进入 designing / signed，但没有任何有效项目。
-- 这些客户需要回查是否漏建项目，或历史项目被误作废。
select
  c.id as customer_id,
  c.tenant_id,
  c.name,
  c.phone,
  c.status,
  c.created_at
from public.customers c
where c.status in ('designing', 'signed')
  and not exists (
    select 1
    from public.projects p
    where p.customer_id = c.id
      and p.tenant_id = c.tenant_id
      and coalesce(p.status, '') <> 'invalid'
  )
order by c.created_at desc;

-- 6. 同一客户同一房产存在多个有效项目。
-- start_design 兜底会复用有效项目；这里检查历史重复项目。
select
  tenant_id,
  customer_id,
  property_id,
  count(*) as active_project_count,
  array_agg(id order by created_at desc) as project_ids
from public.projects
where customer_id is not null
  and property_id is not null
  and coalesce(status, '') <> 'invalid'
group by tenant_id, customer_id, property_id
having count(*) > 1
order by active_project_count desc;

-- 7. 已签约项目缺少签约金额。
select
  id,
  tenant_id,
  name,
  customer_id,
  status,
  signed_amount
from public.projects
where status in (
    'signed',
    'design_finalized',
    'pending_start',
    'started',
    'constructing',
    'acceptance'
  )
  and coalesce(signed_amount, 0) <= 0
order by created_at desc;

-- 8. 待开工及后续项目缺少开工日期。
select
  id,
  tenant_id,
  name,
  customer_id,
  status,
  start_date
from public.projects
where status in ('pending_start', 'started', 'constructing', 'acceptance')
  and start_date is null
order by created_at desc;

-- 可选修复：项目已签约或进入交付后，客户仍为 designing 的数据补成 signed。
-- 执行前必须先确认第 3 条查询结果。
--
-- begin;
--
-- with signed_candidates as (
--   select distinct on (c.id)
--     c.id as customer_id,
--     c.tenant_id,
--     c.status as from_status,
--     p.id as project_id,
--     p.status as project_status
--   from public.projects p
--   join public.customers c
--     on c.id = p.customer_id
--    and c.tenant_id = p.tenant_id
--   where p.status in (
--       'signed',
--       'design_finalized',
--       'pending_start',
--       'started',
--       'constructing',
--       'acceptance'
--     )
--     and c.status = 'designing'
--   order by c.id, p.created_at desc
-- ),
-- inserted_logs as (
--   insert into public.customer_status_transition_logs (
--     tenant_id,
--     customer_id,
--     from_status,
--     to_status,
--     action,
--     operator_employee_id,
--     operator_auth_user_id,
--     reason,
--     metadata
--   )
--   select
--     tenant_id,
--     customer_id,
--     from_status,
--     'signed',
--     'mark_signed',
--     null,
--     null,
--     null,
--     jsonb_build_object(
--       'source', 'data_consistency_repair',
--       'project_id', project_id,
--       'project_status', project_status
--     )
--   from signed_candidates
--   returning customer_id
-- )
-- update public.customers c
-- set status = 'signed'
-- from signed_candidates sc
-- where c.id = sc.customer_id
--   and c.tenant_id = sc.tenant_id;
--
-- commit;
