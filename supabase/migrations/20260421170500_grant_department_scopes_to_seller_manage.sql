INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'department'
FROM public.roles r
JOIN public.permissions p
  ON p.code = ANY (
    ARRAY[
      'customer.read',
      'customer.update',
      'customer.assign_owner',
      'project.read',
      'project.update'
    ]
  )
WHERE r.code = 'seller_manage'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;
