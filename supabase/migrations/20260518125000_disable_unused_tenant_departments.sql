-- 租户部门从“模板全量启用”修正为“租户手工启用”。
-- 历史数据只保留已有员工绑定的部门，其余部门和对应岗位规则一起停用。

WITH unused_tenant_departments AS (
  SELECT
    tenant_department.id
  FROM public.tenant_departments AS tenant_department
  WHERE tenant_department.enabled = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.tenant_department_id = tenant_department.id
         OR employee.department_id = tenant_department.legacy_department_id
    )
)
UPDATE public.department_post_rules AS rule
SET
  enabled = false,
  updated_at = now()
FROM unused_tenant_departments
WHERE rule.tenant_department_id = unused_tenant_departments.id
  AND rule.enabled = true;

WITH unused_tenant_departments AS (
  SELECT
    tenant_department.id
  FROM public.tenant_departments AS tenant_department
  WHERE tenant_department.enabled = true
    AND NOT EXISTS (
    SELECT 1
    FROM public.employees AS employee
    WHERE employee.tenant_department_id = tenant_department.id
       OR employee.department_id = tenant_department.legacy_department_id
    )
)
UPDATE public.tenant_departments AS tenant_department
SET
  enabled = false,
  updated_at = now()
FROM unused_tenant_departments
WHERE tenant_department.id = unused_tenant_departments.id;
