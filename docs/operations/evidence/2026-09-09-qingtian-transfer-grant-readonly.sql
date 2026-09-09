-- Guarded DEV host only. Scalar hashes prove the two-row grant scope.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT jsonb_build_object(
  'checked_at', clock_timestamp(),
  'target', (SELECT jsonb_build_object('id', r.id, 'tenant_id', r.tenant_id,
    'code', r.code, 'status', r.status, 'tenant_name', t.name, 'tenant_status', t.status)
    FROM public.roles r JOIN public.tenants t ON t.id = r.tenant_id
    WHERE r.id = 'e72850fe-dbba-427f-9109-f1779080a239'),
  -- Unique permission code and role/permission key guarantee <= 2 rows.
  'target_role_grants', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'role_id', rp.role_id, 'permission_id', p.id, 'code', p.code, 'access_scope', rp.access_scope)
    ORDER BY p.code), '[]'::jsonb)
    FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = 'e72850fe-dbba-427f-9109-f1779080a239'
      AND p.code IN ('inventory.transfer.manage', 'inventory.transfer.approve')),
  'other_role_permissions', (SELECT jsonb_build_object('count', count(*),
    'md5', md5(coalesce(string_agg(to_jsonb(rp)::text, '' ORDER BY rp.role_id, rp.permission_id), '')))
    FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id
    WHERE NOT (rp.role_id = 'e72850fe-dbba-427f-9109-f1779080a239'
      AND p.code IN ('inventory.transfer.manage', 'inventory.transfer.approve'))),
  'employee_overrides', (SELECT jsonb_build_object('count', count(*),
    'md5', md5(coalesce(string_agg(to_jsonb(e)::text, '' ORDER BY e.id), '')))
    FROM public.employee_permission_overrides e),
  'employee_roles', (SELECT jsonb_build_object('count', count(*),
    'md5', md5(coalesce(string_agg(to_jsonb(e)::text, '' ORDER BY e.employee_id, e.role_id), '')))
    FROM public.employee_roles e),
  'permission_helper_md5', md5(pg_get_functiondef(
    'public.__gooes_has_tenant_procurement_permission(uuid,uuid,text)'::regprocedure)),
  'manage_allowed', public.__gooes_has_tenant_procurement_permission(
    '3eebca47-961f-4899-b976-a3d3208d326b', 'd8ecc522-e6a1-49d6-b7b7-aaa0f3084826', 'inventory.transfer.manage'),
  'approve_allowed', public.__gooes_has_tenant_procurement_permission(
    '3eebca47-961f-4899-b976-a3d3208d326b', 'd8ecc522-e6a1-49d6-b7b7-aaa0f3084826', 'inventory.transfer.approve')
);
COMMIT;
