-- Ordinary employees should be able to see project summaries, lists, and details.
-- Widen employee_base project.read from self to all.
INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'all'
FROM public.roles r
JOIN public.permissions p
  ON p.code = 'project.read'
WHERE r.code = 'employee_base'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;
