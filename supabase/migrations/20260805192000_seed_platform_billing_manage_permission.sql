-- Seed platform billing management permission.
--
-- Rollback strategy:
-- use a forward migration to mark platform.billing.manage inactive and remove
-- role_permissions bindings if the permission must be withdrawn.

INSERT INTO public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
VALUES (
  'platform.billing.manage',
  '管理平台计费',
  'platform_billing',
  'billing',
  'manage',
  '人工调整平台计费、维护计费规则和执行影子计费',
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
  ON permissions.code = 'platform.billing.manage'
  AND permissions.status = 'active'
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = 'all';
