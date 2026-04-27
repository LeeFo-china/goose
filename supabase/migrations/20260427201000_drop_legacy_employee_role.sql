drop policy if exists "Approvers view pending" on public.expense_requests;

alter table public.employees
drop constraint if exists employees_role_check;

drop index if exists idx_employees_role;

alter table public.employees
drop column if exists role;
