-- Tenant Douyin miniapp workspace permissions and single active merchant guard.
--
-- Rollback (forward migration only):
-- 1. Disable tenant Douyin workspace and lead mutation endpoints.
-- 2. Drop douyin_miniapp_installations_one_active_merchant_per_tenant.
-- 3. Remove role_permissions for the exact permission codes below.
-- 4. Remove the exact permission rows only after confirming no role or audit
--    history still references them.

BEGIN;

INSERT INTO public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
VALUES
  (
    'douyin_miniapp.read',
    '查看抖音小程序',
    'douyin_miniapp',
    'douyin_miniapp',
    'read',
    '查看租户抖音小程序工作台',
    'active'
  ),
  (
    'douyin_miniapp.manage',
    '管理抖音小程序',
    'douyin_miniapp',
    'douyin_miniapp',
    'manage',
    '发起授权和生成体验二维码',
    'active'
  ),
  (
    'douyin_miniapp.audit.submit',
    '提交抖音审核',
    'douyin_miniapp',
    'douyin_miniapp',
    'audit_submit',
    '提交抖音小程序审核',
    'active'
  ),
  (
    'douyin_lead.read',
    '查看抖音线索',
    'douyin_miniapp',
    'douyin_lead',
    'read',
    '查看权限范围内的抖音线索',
    'active'
  ),
  (
    'douyin_lead.assign',
    '分配抖音线索',
    'douyin_miniapp',
    'douyin_lead',
    'assign',
    '分配和改派抖音线索负责人',
    'active'
  ),
  (
    'douyin_lead.follow_up',
    '跟进抖音线索',
    'douyin_miniapp',
    'douyin_lead',
    'follow_up',
    '记录抖音线索跟进',
    'active'
  ),
  (
    'douyin_lead.convert',
    '转化抖音线索',
    'douyin_miniapp',
    'douyin_lead',
    'convert',
    '将抖音线索转为客户',
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
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'douyin_miniapp.read',
    'douyin_miniapp.manage',
    'douyin_miniapp.audit.submit',
    'douyin_lead.read',
    'douyin_lead.assign',
    'douyin_lead.follow_up',
    'douyin_lead.convert'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
  AND roles.status = 'active'
  AND permissions.status = 'active'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

DO $$
BEGIN
  IF EXISTS (
    SELECT installations.tenant_id
    FROM public.douyin_miniapp_installations AS installations
    WHERE installations.tenant_id IS NOT NULL
      AND installations.installation_kind = 'merchant'
      AND installations.authorization_status = 'active'
    GROUP BY installations.tenant_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_TENANT_MULTIPLE_ACTIVE_MERCHANT_INSTALLATIONS';
  END IF;
END;
$$;

CREATE UNIQUE INDEX douyin_miniapp_installations_one_active_merchant_per_tenant
ON public.douyin_miniapp_installations(tenant_id)
WHERE tenant_id IS NOT NULL
  AND installation_kind = 'merchant'
  AND authorization_status = 'active';

COMMIT;
