-- Register city partner permissions and grant them to platform super admins.

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'platform.partner.read',
    '查看城市合伙人',
    'platform_partner',
    'partner',
    'read',
    '查看城市合伙人、等级、邀请码和装企绑定信息',
    'active'
  ),
  (
    'platform.partner.manage',
    '管理城市合伙人',
    'platform_partner',
    'partner',
    'manage',
    '创建、编辑、审核和调整城市合伙人基础信息',
    'active'
  ),
  (
    'platform.partner.level.manage',
    '管理合伙人等级',
    'platform_partner',
    'partner_level',
    'manage',
    '管理城市合伙人等级、收益比例和结算规则',
    'active'
  ),
  (
    'platform.partner.binding.manage',
    '管理合伙人装企绑定',
    'platform_partner',
    'partner_binding',
    'manage',
    '管理城市合伙人与装修公司的绑定关系',
    'active'
  ),
  (
    'platform.partner.revenue.read',
    '查看合伙人平台收入',
    'platform_partner',
    'partner_revenue',
    'read',
    '查看合伙人相关的平台收入事件',
    'active'
  ),
  (
    'platform.partner.revenue.manage',
    '管理合伙人平台收入',
    'platform_partner',
    'partner_revenue',
    'manage',
    '同步和确认合伙人相关的平台收入事件',
    'active'
  ),
  (
    'platform.partner.commission.read',
    '查看合伙人佣金',
    'platform_partner',
    'partner_commission',
    'read',
    '查看城市合伙人分佣台账',
    'active'
  ),
  (
    'platform.partner.commission.manage',
    '管理合伙人佣金',
    'platform_partner',
    'partner_commission',
    'manage',
    '调整城市合伙人分佣台账状态',
    'active'
  ),
  (
    'platform.partner.settlement.manage',
    '管理合伙人结算',
    'platform_partner',
    'partner_settlement',
    'manage',
    '生成、审核和登记城市合伙人月结批次',
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
    'platform.partner.read',
    'platform.partner.manage',
    'platform.partner.level.manage',
    'platform.partner.binding.manage',
    'platform.partner.revenue.read',
    'platform.partner.revenue.manage',
    'platform.partner.commission.read',
    'platform.partner.commission.manage',
    'platform.partner.settlement.manage'
  )
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;
