-- Register official website CMS permissions for platform super admins.
--
-- Rollback: only before production content exists, delete the three matching
-- role_permissions rows and permission rows. After content exists, preserve the
-- audit relationship and disable access through a forward migration instead.

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'platform.site_content.read',
    '查看官网内容',
    'platform_site_content',
    'site_content',
    'read',
    '查看官网内容、版本历史和发布状态',
    'active'
  ),
  (
    'platform.site_content.manage',
    '管理官网内容',
    'platform_site_content',
    'site_content',
    'manage',
    '创建和编辑官网内容及草稿版本',
    'active'
  ),
  (
    'platform.site_content.publish',
    '发布官网内容',
    'platform_site_content',
    'site_content',
    'publish',
    '发布、回滚和归档官网内容',
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
    'platform.site_content.read',
    'platform.site_content.manage',
    'platform.site_content.publish'
  )
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;
