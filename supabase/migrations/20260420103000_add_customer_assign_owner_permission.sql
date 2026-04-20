INSERT INTO public.permissions (code, module, resource, action, description, status)
VALUES (
  'customer.assign_owner',
  'customer',
  'customer',
  'assign_owner',
  '分配客户负责人',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'all'
FROM public.roles r
JOIN public.permissions p
  ON p.code = 'customer.assign_owner'
WHERE r.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;
