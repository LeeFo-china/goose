-- DEV-only investigation. No grants, writes, or business commands.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
WITH actor AS (
  SELECT e.id, e.tenant_id, e.status
  FROM public.employees e
  WHERE e.tenant_id = '3eebca47-961f-4899-b976-a3d3208d326b'
    AND e.id = 'd8ecc522-e6a1-49d6-b7b7-aaa0f3084826'
), checks AS (
  SELECT p.code, p.status,
    public.__gooes_has_tenant_procurement_permission(a.tenant_id, a.id, p.code) AS database_allowed,
    (SELECT count(*) FROM public.employee_roles er
      JOIN public.roles r ON r.id = er.role_id AND r.status = 'active'
        AND (r.tenant_id = a.tenant_id OR r.tenant_id IS NULL)
      JOIN public.role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id
      WHERE er.employee_id = a.id) AS matching_role_grants,
    (SELECT count(*) FROM public.employee_permission_overrides eo
      WHERE eo.employee_id = a.id AND eo.permission_id = p.id AND eo.effect = 'allow') AS employee_allows,
    (SELECT count(*) FROM public.employee_permission_overrides eo
      WHERE eo.employee_id = a.id AND eo.permission_id = p.id AND eo.effect = 'deny') AS employee_denies
  FROM actor a CROSS JOIN public.permissions p
  WHERE p.code IN ('inventory.stock.view', 'inventory.transfer.manage', 'inventory.transfer.approve')
)
SELECT jsonb_build_object(
  'checked_at', clock_timestamp(),
  'actor', (SELECT to_jsonb(a) FROM actor a),
  'roles', (SELECT jsonb_agg(to_jsonb(r)) FROM (
    SELECT r.id, r.code, r.status, r.tenant_id FROM public.employee_roles er
    JOIN public.roles r ON r.id = er.role_id JOIN actor a ON a.id = er.employee_id
    ORDER BY r.id LIMIT 20) r),
  'permissions', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.code) FROM checks c),
  'database_helper', pg_get_functiondef(
    'public.__gooes_has_tenant_procurement_permission(uuid,uuid,text)'::regprocedure)
);
COMMIT;
