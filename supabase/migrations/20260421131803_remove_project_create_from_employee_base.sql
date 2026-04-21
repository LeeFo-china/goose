-- Ordinary employees can read projects but should not create them by default.
DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'employee_base'
  AND p.code = 'project.create';
