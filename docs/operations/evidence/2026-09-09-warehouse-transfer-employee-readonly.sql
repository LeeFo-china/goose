-- DEV only: inspect existing test-tenant role assignments; never grant permissions.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT e.id, e.user_id, e.name, e.status,
  (SELECT jsonb_agg(jsonb_build_object('code', r.code, 'status', r.status) ORDER BY r.code)
   FROM public.employee_roles er JOIN public.roles r ON r.id = er.role_id
   WHERE er.employee_id = e.id) AS roles
FROM public.employees e
WHERE e.tenant_id = '3eebca47-961f-4899-b976-a3d3208d326b'
  AND (e.user_id = '31ae8836-9646-4514-a38b-baf1d989f3c0' OR EXISTS (
    SELECT 1 FROM public.employee_roles er JOIN public.roles r ON r.id = er.role_id
    WHERE er.employee_id = e.id AND r.code = 'system_admin'))
ORDER BY e.id LIMIT 20;
COMMIT;
