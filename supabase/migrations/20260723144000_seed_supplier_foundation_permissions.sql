-- Rollback: in a forward migration, remove the matching scoped role_permissions rows
-- from platform_admin/system_admin roles, then disable or remove the
-- permission rows only after confirming no audit history depends on them.

BEGIN;

INSERT INTO public.permissions (
  code, name, module, resource, action, description, status
)
VALUES
  ('platform.supplier.view', '查看平台供应商', 'platform_supplier', 'supplier', 'view', '查看平台供应商主数据和准入状态', 'active'),
  ('platform.supplier.review', '审核供应商准入', 'platform_supplier', 'supplier', 'review', '审核供应商准入和资质', 'active'),
  ('platform.supplier.manage', '管理平台供应商', 'platform_supplier', 'supplier', 'manage', '维护平台供应商资料和租户模块设置', 'active'),
  ('platform.supplier.blacklist', '管理供应商黑名单', 'platform_supplier', 'supplier', 'blacklist', '暂停、恢复或永久拉黑平台供应商', 'active'),
  ('platform.catalog.manage', '管理供应标准目录', 'platform_supplier_catalog', 'catalog', 'manage', '维护供应商标准分类、品牌和单位', 'active'),
  ('supplier.view', '查看合作供应商', 'supplier', 'supplier', 'view', '查看当前租户合作供应商和准入信息', 'active'),
  ('supplier.manage', '管理合作供应商', 'supplier', 'supplier', 'manage', '维护当前租户供应商合作关系和合同策略', 'active'),
  ('supplier.contract.manage', '管理供应商合同', 'supplier', 'contract', 'manage', '维护当前租户供应商合同生命周期', 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'platform.supplier.view',
    'platform.supplier.review',
    'platform.supplier.manage',
    'platform.supplier.blacklist',
    'platform.catalog.manage'
  )
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'supplier.view',
    'supplier.manage',
    'supplier.contract.manage'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMIT;
