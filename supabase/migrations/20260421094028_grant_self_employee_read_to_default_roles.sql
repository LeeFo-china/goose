-- Allow default employee-facing roles to read their own employee record.
-- Keep existing role-specific overrides/scopes if they already exist.
INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'self'
FROM public.roles r
JOIN public.permissions p
  ON p.code = 'employee.read'
WHERE r.code IN ('employee_base', 'finance_base')
ON CONFLICT (role_id, permission_id) DO NOTHING;
