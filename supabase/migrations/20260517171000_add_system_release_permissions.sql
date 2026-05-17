INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'system.release.read',
    '查看版本发布',
    'system',
    'release',
    'read',
    '允许查看开发和生产环境发布状态',
    'active'
  ),
  (
    'system.release.run',
    '发起版本发布',
    'system',
    'release',
    'run',
    '允许通过超管后台发起受控发布',
    'active'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code IN (
    'system.release.read',
    'system.release.run'
  )
WHERE roles.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;
