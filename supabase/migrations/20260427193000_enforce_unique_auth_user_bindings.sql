with duplicated_employees as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at desc nulls last, id desc
    ) as rn
  from public.employees
  where user_id is not null
)
update public.employees e
set user_id = null
from duplicated_employees d
where e.id = d.id
  and d.rn > 1;

with duplicated_customers as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at desc nulls last, id desc
    ) as rn
  from public.customers
  where user_id is not null
)
update public.customers c
set user_id = null
from duplicated_customers d
where c.id = d.id
  and d.rn > 1;

create unique index if not exists employees_user_id_unique
on public.employees(user_id)
where user_id is not null;

create unique index if not exists customers_user_id_unique
on public.customers(user_id)
where user_id is not null;
