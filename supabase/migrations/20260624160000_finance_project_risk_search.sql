create or replace function public.search_finance_project_risk_ids(
  p_tenant_id uuid,
  p_page integer default 1,
  p_page_size integer default 20,
  p_keyword text default null,
  p_status text default null,
  p_risk_level text default null,
  p_risk_flag text default null,
  p_budget_configured boolean default null,
  p_has_unallocated_expense boolean default null,
  p_overdue boolean default null,
  p_min_budget_usage_ratio numeric default null,
  p_max_projected_budget_gross_margin numeric default null
)
returns table (
  project_id uuid,
  total_count bigint
)
language sql
stable
as $$
with normalized as (
  select
    greatest(coalesce(p_page, 1), 1) as page,
    least(greatest(coalesce(p_page_size, 20), 1), 100) as page_size,
    nullif(trim(p_keyword), '') as keyword,
    nullif(trim(p_status), '') as status,
    nullif(trim(p_risk_level), '') as risk_level,
    nullif(trim(p_risk_flag), '') as risk_flag
),
base_projects as (
  select
    p.id,
    p.name,
    p.status,
    coalesce(p.signed_amount, p.budget, 0)::numeric as contract_amount,
    p.created_at
  from public.projects p, normalized n
  where p.tenant_id = p_tenant_id
    and (n.status is null or p.status = n.status)
    and (
      n.keyword is null
      or p.name ilike '%' || n.keyword || '%'
      or p.id::text = n.keyword
    )
),
ledger_totals as (
  select
    l.project_id,
    coalesce(sum(l.amount) filter (where l.direction = 'in'), 0)::numeric as income_amount,
    coalesce(sum(l.amount) filter (where l.direction = 'out'), 0)::numeric as expense_amount,
    coalesce(sum(l.amount) filter (
      where l.direction = 'out' and l.cost_category_id is null
    ), 0)::numeric as unallocated_expense_amount
  from public.finance_ledger_entries l
  join base_projects bp on bp.id = l.project_id
  where l.tenant_id = p_tenant_id
  group by l.project_id
),
receivable_totals as (
  select
    r.project_id,
    coalesce(sum(greatest(coalesce(r.amount, 0) - coalesce(r.paid_amount, 0), 0)) filter (
      where r.status <> 'canceled'
    ), 0)::numeric as receivable_remaining_amount,
    coalesce(sum(greatest(coalesce(r.amount, 0) - coalesce(r.paid_amount, 0), 0)) filter (
      where r.status <> 'canceled'
        and r.status <> 'paid'
        and r.due_date < current_date
    ), 0)::numeric as overdue_amount,
    coalesce(count(*) filter (
      where r.status <> 'canceled'
        and r.status <> 'paid'
        and r.due_date < current_date
        and greatest(coalesce(r.amount, 0) - coalesce(r.paid_amount, 0), 0) > 0
    ), 0)::integer as overdue_count
  from public.project_receivable_plans r
  join base_projects bp on bp.id = r.project_id
  where r.tenant_id = p_tenant_id
  group by r.project_id
),
budget_totals as (
  select
    b.project_id,
    coalesce(sum(b.budget_amount), 0)::numeric as budget_amount,
    count(*)::integer as budget_count
  from public.project_cost_budgets b
  join base_projects bp on bp.id = b.project_id
  where b.tenant_id = p_tenant_id
    and b.status = 'active'
  group by b.project_id
),
category_expenses as (
  select
    l.project_id,
    l.cost_category_id,
    coalesce(sum(l.amount), 0)::numeric as expense_amount
  from public.finance_ledger_entries l
  join base_projects bp on bp.id = l.project_id
  where l.tenant_id = p_tenant_id
    and l.direction = 'out'
    and l.cost_category_id is not null
  group by l.project_id, l.cost_category_id
),
category_over_budget as (
  select distinct b.project_id
  from public.project_cost_budgets b
  join category_expenses e
    on e.project_id = b.project_id
   and e.cost_category_id = b.cost_category_id
  where b.tenant_id = p_tenant_id
    and b.status = 'active'
    and e.expense_amount > b.budget_amount *
      (coalesce(b.warning_threshold_percent, 100) / 100.0)
),
risk_rows as (
  select
    bp.id as project_id,
    bp.created_at,
    coalesce(l.income_amount, 0) as received_amount,
    coalesce(l.expense_amount, 0) as expense_amount,
    coalesce(l.unallocated_expense_amount, 0) as unallocated_expense_amount,
    coalesce(rt.overdue_count, 0) as overdue_count,
    coalesce(rt.overdue_amount, 0) as overdue_amount,
    coalesce(bt.budget_amount, 0) as budget_amount,
    coalesce(bt.budget_count, 0) > 0 as budget_configured,
    case
      when coalesce(bt.budget_amount, 0) > 0
        then coalesce(l.expense_amount, 0) / bt.budget_amount
      else null
    end as budget_usage_ratio,
    case
      when bp.contract_amount > 0 and coalesce(bt.budget_count, 0) > 0
        then (bp.contract_amount - coalesce(bt.budget_amount, 0)) / bp.contract_amount
      else null
    end as projected_budget_gross_margin,
    coalesce(cob.project_id is not null, false) as has_category_over_budget,
    (coalesce(l.income_amount, 0) - coalesce(l.expense_amount, 0)) < 0
      as negative_actual_profit,
    (
      coalesce(bt.budget_count, 0) > 0
      and bp.contract_amount - coalesce(bt.budget_amount, 0) < 0
    ) as negative_projected_profit
  from base_projects bp
  left join ledger_totals l on l.project_id = bp.id
  left join receivable_totals rt on rt.project_id = bp.id
  left join budget_totals bt on bt.project_id = bp.id
  left join category_over_budget cob on cob.project_id = bp.id
),
flagged as (
  select
    rr.*,
    array_remove(array[
      case when not rr.budget_configured then 'budget_missing' end,
      case when rr.unallocated_expense_amount > 0 then 'unallocated_expense' end,
      case when rr.has_category_over_budget then 'category_over_budget' end,
      case when rr.budget_configured and rr.expense_amount > rr.budget_amount then 'project_over_budget' end,
      case when rr.projected_budget_gross_margin is not null
        and rr.projected_budget_gross_margin < 0.2 then 'low_projected_margin' end,
      case when rr.overdue_count > 0 then 'receivable_overdue' end,
      case when rr.negative_actual_profit then 'negative_actual_profit' end,
      case when rr.negative_projected_profit then 'negative_projected_profit' end
    ], null)::text[] as risk_flags
  from risk_rows rr
),
leveled as (
  select
    f.*,
    case
      when f.risk_flags && array[
        'project_over_budget',
        'negative_actual_profit',
        'negative_projected_profit'
      ]::text[] then 'danger'
      when f.risk_flags && array[
        'category_over_budget',
        'low_projected_margin',
        'receivable_overdue'
      ]::text[] then 'warning'
      when f.risk_flags && array[
        'budget_missing',
        'unallocated_expense'
      ]::text[] then 'info'
      else 'normal'
    end as risk_level
  from flagged f
),
filtered as (
  select l.*
  from leveled l, normalized n
  where (n.risk_level is null or l.risk_level = n.risk_level)
    and (n.risk_flag is null or n.risk_flag = any(l.risk_flags))
    and (p_budget_configured is null or l.budget_configured = p_budget_configured)
    and (
      p_has_unallocated_expense is null
      or (l.unallocated_expense_amount > 0) = p_has_unallocated_expense
    )
    and (p_overdue is null or (l.overdue_count > 0) = p_overdue)
    and (
      p_min_budget_usage_ratio is null
      or l.budget_usage_ratio >= p_min_budget_usage_ratio
    )
    and (
      p_max_projected_budget_gross_margin is null
      or l.projected_budget_gross_margin <= p_max_projected_budget_gross_margin
    )
),
numbered as (
  select
    f.project_id,
    count(*) over() as total_count,
    row_number() over(order by f.created_at desc, f.project_id desc) as row_number
  from filtered f
)
select
  n.project_id,
  n.total_count
from numbered n, normalized p
where n.row_number > ((p.page - 1) * p.page_size)
  and n.row_number <= (p.page * p.page_size)
order by n.row_number;
$$;
