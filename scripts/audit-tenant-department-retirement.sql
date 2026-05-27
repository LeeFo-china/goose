with audit_results as (
  select
    'employee_tenant_department_tenant_mismatch' as check_code,
    '员工 tenant_id 与租户部门 tenant_id 不一致' as check_name,
    'blocker' as severity,
    count(*)::bigint as issue_count
  from public.employees as employee
  join public.tenant_departments as tenant_department
    on tenant_department.id = employee.tenant_department_id
  where employee.tenant_id is distinct from tenant_department.tenant_id

  union all

  select
    'rules_missing_tenant_department' as check_code,
    '部门岗位规则缺少 tenant_department_id' as check_name,
    'blocker' as severity,
    count(*)::bigint as issue_count
  from public.department_post_rules as rule
  where rule.tenant_department_id is null

  union all

  select
    'rule_department_code_mismatch' as check_code,
    '部门岗位规则 department_code 与租户部门 code 不一致' as check_name,
    'blocker' as severity,
    count(*)::bigint as issue_count
  from public.department_post_rules as rule
  join public.tenant_departments as tenant_department
    on tenant_department.id = rule.tenant_department_id
  where rule.department_code is distinct from tenant_department.code

  union all

  select
    'rule_tenant_department_tenant_mismatch' as check_code,
    '部门岗位规则 tenant_id 与租户部门 tenant_id 不一致' as check_name,
    'blocker' as severity,
    count(*)::bigint as issue_count
  from public.department_post_rules as rule
  join public.tenant_departments as tenant_department
    on tenant_department.id = rule.tenant_department_id
  where rule.tenant_id is distinct from tenant_department.tenant_id

  union all

  select
    'enabled_tenant_department_missing_legacy' as check_code,
    '已启用租户部门缺少 legacy_department_id' as check_name,
    'warning' as severity,
    count(*)::bigint as issue_count
  from public.tenant_departments as tenant_department
  where tenant_department.enabled = true
    and tenant_department.legacy_department_id is null

  union all

  select
    'tenant_department_legacy_missing_department' as check_code,
    '租户部门 legacy_department_id 指向的旧部门不存在' as check_name,
    'blocker' as severity,
    count(*)::bigint as issue_count
  from public.tenant_departments as tenant_department
  left join public.departments as department
    on department.id = tenant_department.legacy_department_id
  where tenant_department.legacy_department_id is not null
    and department.id is null

  union all

  select
    'tenant_department_code_template_mismatch' as check_code,
    '租户部门 code 与标准模板 code 不一致' as check_name,
    'blocker' as severity,
    count(*)::bigint as issue_count
  from public.tenant_departments as tenant_department
  join public.department_templates as template
    on template.id = tenant_department.template_id
  where tenant_department.code is distinct from template.code
)
select
  check_code,
  check_name,
  severity,
  issue_count,
  case
    when issue_count = 0 then 'pass'
    when severity = 'warning' then 'review'
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
