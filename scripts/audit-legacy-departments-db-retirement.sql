with runtime_function_refs as (
  select
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_functiondef(p.oid) as function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
    and (
      pg_get_functiondef(p.oid) ilike '%public.departments%'
      or pg_get_functiondef(p.oid) ilike '%legacy_department_id%'
    )
),
audit_results as (
  select
    'departments_table_exists' as check_code,
    '旧 departments 表仍存在，阶段 1 软删除前应为 true' as check_name,
    'info' as severity,
    case when to_regclass('public.departments') is null then 0 else 1 end::bigint as issue_count

  union all

  select
    'tenant_departments_legacy_column_exists' as check_code,
    'tenant_departments.legacy_department_id 仍存在，阶段 1 软删除前应为 true' as check_name,
    'info' as severity,
    count(*)::bigint as issue_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'tenant_departments'
    and column_name = 'legacy_department_id'

  union all

  select
    'runtime_function_refs_legacy_department' as check_code,
    'public 函数仍引用 public.departments 或 legacy_department_id' as check_name,
    'blocker' as severity,
    count(*)::bigint as issue_count
  from runtime_function_refs

  union all

  select
    'rules_missing_tenant_department' as check_code,
    '部门岗位规则缺少 tenant_department_id' as check_name,
    'blocker' as severity,
    count(*)::bigint as issue_count
  from public.department_post_rules
  where tenant_department_id is null
)
select
  check_code,
  check_name,
  severity,
  issue_count,
  case
    when severity = 'info' then 'observe'
    when issue_count = 0 then 'pass'
    else 'fail'
  end as status
from audit_results
order by
  case severity
    when 'blocker' then 1
    when 'warning' then 2
    else 3
  end,
  check_code;
