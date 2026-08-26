create or replace function public.get_tenant_owner_finance_snapshot(
  p_tenant_id uuid,
  p_business_date date,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_due_7d date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ledger as (
    select
      coalesce(sum(amount) filter (where direction = 'in'), 0)::numeric as income,
      coalesce(sum(amount) filter (where direction = 'out'), 0)::numeric as expense
    from finance_ledger_entries
    where tenant_id = p_tenant_id
      and occurred_at >= p_start_at
      and occurred_at < p_end_at
  ),
  receivables as (
    select
      coalesce(sum(greatest(amount - paid_amount, 0)) filter (
        where due_date = p_business_date
      ), 0)::numeric as due_today,
      coalesce(sum(greatest(amount - paid_amount, 0)) filter (
        where due_date <= p_due_7d
      ), 0)::numeric as due_7d,
      coalesce(sum(greatest(amount - paid_amount, 0)) filter (
        where due_date < p_business_date and status <> 'paid'
      ), 0)::numeric as overdue
    from project_receivable_plans
    where tenant_id = p_tenant_id
      and status <> 'canceled'
      and due_date <= p_due_7d
  ),
  payables as (
    select coalesce(sum(amount), 0)::numeric as amount
    from supplier_payable_events
    where tenant_id = p_tenant_id
  ),
  payments as (
    select coalesce(sum(amount), 0)::numeric as amount
    from supplier_payments
    where tenant_id = p_tenant_id
  )
  select jsonb_build_object(
    'today_income_amount', ledger.income,
    'today_expense_amount', ledger.expense,
    'today_net_cash_amount', ledger.income - ledger.expense,
    'receivable_due_today_amount', receivables.due_today,
    'receivable_due_7d_amount', receivables.due_7d,
    'overdue_receivable_amount', receivables.overdue,
    'pending_supplier_payable_amount', greatest(payables.amount - payments.amount, 0)
  )
  from ledger, receivables, payables, payments;
$$;

create or replace function public.get_tenant_owner_project_daily_snapshot(
  p_tenant_id uuid,
  p_business_date date,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active_projects as (
    select id
    from projects
    where tenant_id = p_tenant_id
      and status = any(array[
        'designing',
        'proposal_confirmed',
        'signed',
        'design_finalized',
        'pending_start',
        'started',
        'constructing',
        'on_hold',
        'acceptance'
      ])
  ),
  started as (
    select distinct project_id
    from project_procedure_assignments
    where tenant_id = p_tenant_id
      and started_at >= p_start_at
      and started_at < p_end_at
  ),
  completed as (
    select distinct project_id
    from project_procedure_assignments
    where tenant_id = p_tenant_id
      and completed_at >= p_start_at
      and completed_at < p_end_at
  ),
  advanced as (
    select project_id from started
    union
    select project_id from completed
  ),
  delayed as (
    select distinct project_id
    from project_procedure_assignments
    where tenant_id = p_tenant_id
      and planned_end_date < p_business_date
      and status not in ('completed', 'canceled')
  ),
  today_logs as (
    select distinct project_id
    from project_logs
    where tenant_id = p_tenant_id
      and created_at >= p_start_at
      and created_at < p_end_at
  ),
  pending_acceptances as (
    select count(*)::bigint as total
    from project_acceptances
    where tenant_id = p_tenant_id
      and status in ('submitted', 'pending', 'reviewing')
  )
  select jsonb_build_object(
    'active_project_count', (select count(*) from active_projects),
    'advanced_today_count', (select count(*) from advanced),
    'started_today_count', (select count(*) from started),
    'completed_today_count', (select count(*) from completed),
    'delayed_project_count', (select count(*) from delayed),
    'no_log_today_count', (
      select count(*)
      from delayed
      where not exists (
        select 1
        from today_logs
        where today_logs.project_id = delayed.project_id
      )
    ),
    'pending_acceptance_count', (select total from pending_acceptances)
  );
$$;

create or replace function public.list_tenant_owner_risk_projects(
  p_tenant_id uuid,
  p_business_date date,
  p_limit integer default 5
)
returns table (
  project_id uuid,
  project_name text,
  customer_name text,
  current_node_title text,
  risk_level text,
  risk_types text[],
  reason text,
  owner_employee_name text,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with delayed as (
    select
      ppa.*,
      row_number() over (
        partition by ppa.project_id
        order by ppa.planned_end_date asc nulls last, ppa.updated_at desc
      ) as project_rank
    from project_procedure_assignments ppa
    where ppa.tenant_id = p_tenant_id
      and ppa.planned_end_date < p_business_date
      and ppa.status not in ('completed', 'canceled')
  ),
  deduped as (
    select *
    from delayed
    where project_rank = 1
  ),
  counted as (
    select
      deduped.*,
      count(*) over () as total_count
    from deduped
    order by deduped.planned_end_date asc nulls last, deduped.updated_at desc
    limit least(greatest(coalesce(p_limit, 5), 1), 100)
  )
  select
    counted.project_id,
    coalesce(projects.name, '未命名项目') as project_name,
    customers.name as customer_name,
    counted.stage_code as current_node_title,
    case
      when counted.planned_end_date <= p_business_date - 3 then 'high'
      else 'warning'
    end as risk_level,
    array['delayed_workflow']::text[] as risk_types,
    '计划结束日期 ' || counted.planned_end_date::text || ' 已逾期' as reason,
    employees.name as owner_employee_name,
    counted.updated_at,
    counted.total_count
  from counted
  join projects on projects.id = counted.project_id
    and projects.tenant_id = counted.tenant_id
  left join customers on customers.id = projects.customer_id
  left join employees on employees.id = counted.assignee_employee_id
    and employees.tenant_id = counted.tenant_id
  order by counted.planned_end_date asc nulls last, counted.updated_at desc;
$$;

create or replace function public.get_tenant_owner_construction_activity_snapshot(
  p_tenant_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with today_logs as (
    select
      project_id,
      case
        when images is null then 0
        when jsonb_typeof(images::jsonb) = 'array' then jsonb_array_length(images::jsonb)
        else 0
      end as image_count
    from project_logs
    where tenant_id = p_tenant_id
      and created_at >= p_start_at
      and created_at < p_end_at
  )
  select jsonb_build_object(
    'log_count', count(*),
    'project_coverage_count', count(distinct project_id),
    'photo_count', coalesce(sum(image_count), 0)
  )
  from today_logs;
$$;

create or replace function public.list_tenant_owner_missing_project_logs(
  p_tenant_id uuid,
  p_business_date date,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_limit integer default 5
)
returns table (
  project_id uuid,
  project_name text,
  current_node_title text,
  assignee_employee_name text,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      ppa.*,
      row_number() over (
        partition by ppa.project_id
        order by ppa.planned_start_date asc, ppa.updated_at desc
      ) as project_rank
    from project_procedure_assignments ppa
    where ppa.tenant_id = p_tenant_id
      and ppa.status in ('planned', 'in_progress')
      and ppa.planned_start_date <= p_business_date
      and not exists (
        select 1
        from project_logs logs
        where logs.tenant_id = p_tenant_id
          and logs.project_id = ppa.project_id
          and logs.created_at >= p_start_at
          and logs.created_at < p_end_at
      )
  ),
  deduped as (
    select *
    from candidates
    where project_rank = 1
  ),
  counted as (
    select
      deduped.*,
      count(*) over () as total_count
    from deduped
    order by deduped.planned_start_date asc, deduped.updated_at desc
    limit least(greatest(coalesce(p_limit, 5), 1), 100)
  )
  select
    counted.project_id,
    coalesce(projects.name, '未命名项目') as project_name,
    counted.stage_code as current_node_title,
    employees.name as assignee_employee_name,
    counted.total_count
  from counted
  join projects on projects.id = counted.project_id
    and projects.tenant_id = counted.tenant_id
  left join employees on employees.id = counted.assignee_employee_id
    and employees.tenant_id = counted.tenant_id
  order by counted.planned_start_date asc, counted.updated_at desc;
$$;
