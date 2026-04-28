INSERT INTO public.permissions (code, module, resource, action, description, status)
VALUES (
  'task_center.read',
  'task_center',
  'task_center',
  'read',
  '查看待办中心',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT
  rp.role_id,
  p_new.id,
  rp.access_scope
FROM public.role_permissions rp
JOIN public.permissions p_old
  ON p_old.id = rp.permission_id
JOIN public.permissions p_new
  ON p_new.code = 'task_center.read'
WHERE p_old.code = 'dashboard.read'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.employee_permission_overrides (
  employee_id,
  permission_id,
  effect,
  access_scope,
  reason
)
SELECT
  epo.employee_id,
  p_new.id,
  epo.effect,
  epo.access_scope,
  epo.reason
FROM public.employee_permission_overrides epo
JOIN public.permissions p_old
  ON p_old.id = epo.permission_id
JOIN public.permissions p_new
  ON p_new.code = 'task_center.read'
WHERE p_old.code = 'dashboard.read'
ON CONFLICT (employee_id, permission_id) DO UPDATE SET
  effect = EXCLUDED.effect,
  access_scope = EXCLUDED.access_scope,
  reason = EXCLUDED.reason,
  updated_at = now();
