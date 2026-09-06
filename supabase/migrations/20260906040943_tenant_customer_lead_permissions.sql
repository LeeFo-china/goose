-- Add an independent customer-lead permission namespace. Legacy Douyin grants
-- and ordinary employee/role overrides are deliberately not migrated.
-- Rollback: disable the new UI/API first. Use a forward migration to remove only
-- these four grants after auditing new role assignments; retain audit history.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  ('customer_lead.read', '查看客户线索', 'customer_lead', 'customer_lead', 'read',
   '查看租户权限范围内已接入来源的客户线索', 'active'),
  ('customer_lead.assign', '分配客户线索', 'customer_lead', 'customer_lead', 'assign',
   '分配和改派租户权限范围内的客户线索负责人', 'active'),
  ('customer_lead.follow_up', '跟进客户线索', 'customer_lead', 'customer_lead', 'follow_up',
   '记录租户权限范围内的客户线索跟进', 'active'),
  ('customer_lead.convert', '转化客户线索', 'customer_lead', 'customer_lead', 'convert',
   '将客户线索转为客户或标记无效；创建客户仍需 customer.create 权限', 'active')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'customer_lead.read', 'customer_lead.assign',
    'customer_lead.follow_up', 'customer_lead.convert'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
  AND roles.status = 'active'
  AND permissions.status = 'active'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
