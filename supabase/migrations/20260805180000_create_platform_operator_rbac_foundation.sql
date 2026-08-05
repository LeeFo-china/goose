-- Platform operator RBAC foundation.
--
-- Rollback strategy:
-- use a forward migration to mark new platform roles and permissions inactive,
-- and keep admin_auth_version, version, audit, and trigger data for historical
-- safety. Do not physically delete employees, roles, permissions, or audit rows.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS admin_auth_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.platform_audit_logs
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS platform_audit_logs_actor_idempotency_unique
ON public.platform_audit_logs(actor_user_id, action, idempotency_key)
WHERE actor_user_id IS NOT NULL AND idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS employees_platform_status_created_idx
ON public.employees(status, created_at DESC)
WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS roles_platform_status_created_idx
ON public.roles(status, created_at DESC)
WHERE tenant_id IS NULL;

WITH platform_permissions(code, name, module, resource, action, description) AS (
  VALUES
    ('platform.dashboard.read', '查看平台概览', 'platform_dashboard', 'dashboard', 'read', '查看平台概览'),
    ('platform.operator.read', '查看平台运营人员', 'platform_access', 'operator', 'read', '查看平台运营人员'),
    ('platform.operator.manage', '管理平台运营人员', 'platform_access', 'operator', 'manage', '新增、编辑、停用、恢复和强制退出运营人员'),
    ('platform.role.read', '查看平台角色', 'platform_access', 'role', 'read', '查看平台角色与有效权限'),
    ('platform.role.manage', '管理平台角色', 'platform_access', 'role', 'manage', '创建、编辑、归档角色和配置角色权限'),
    ('platform.audit.read', '查看平台审计日志', 'platform_access', 'audit_log', 'read', '查看平台审计日志'),
    ('platform.tenant.read', '查看平台租户', 'platform_tenant', 'tenant', 'read', '查看租户列表和详情'),
    ('platform.tenant.manage', '管理平台租户', 'platform_tenant', 'tenant', 'manage', '创建和编辑租户、初始化租户管理员'),
    ('platform.tenant.status.manage', '管理平台租户状态', 'platform_tenant', 'tenant_status', 'manage', '停用、恢复或归档租户'),
    ('platform.device.read', '查看平台设备资产', 'platform_device', 'device_asset', 'read', '查看平台设备资产'),
    ('platform.device.manage', '管理平台设备资产', 'platform_device', 'device_asset', 'manage', '维护设备、厂商和绑定关系'),
    ('platform.lead.read', '查看平台线索', 'platform_lead', 'lead', 'read', '查看平台线索'),
    ('platform.lead.assign', '分配平台线索', 'platform_lead', 'lead', 'assign', '分配、改派和关闭平台线索'),
    ('platform.picture.read', '查看平台图片资料', 'platform_picture', 'picture', 'read', '查看平台图片资料库'),
    ('platform.picture.manage', '管理平台图片资料', 'platform_picture', 'picture', 'manage', '上传、编辑和归档平台图片'),
    ('platform.marketing_page.read', '查看平台 H5 活动', 'platform_marketing', 'marketing_page', 'read', '查看平台 H5 活动页'),
    ('platform.marketing_page.manage', '管理平台 H5 活动', 'platform_marketing', 'marketing_page', 'manage', '创建和编辑平台 H5 活动页'),
    ('platform.marketing_page.publish', '发布平台 H5 活动', 'platform_marketing', 'marketing_page', 'publish', '发布、下线平台 H5 活动页'),
    ('platform.usage.read', '查看平台用量', 'platform_usage', 'usage', 'read', '查看平台用量统计'),
    ('platform.billing.read', '查看平台计费', 'platform_billing', 'billing', 'read', '查看平台计费总览和订单摘要'),
    ('platform.ai_config.read', '查看平台 AI 路由', 'platform_ai_config', 'ai_config', 'read', '查看 AI 模型路由'),
    ('platform.ai_config.manage', '管理平台 AI 路由', 'platform_ai_config', 'ai_config', 'manage', '修改和验证 AI 模型路由'),
    ('platform.identity_diagnostic.read', '查看平台身份诊断', 'platform_identity', 'identity_diagnostic', 'read', '使用身份排障能力'),
    ('platform.system_setting.read', '查看平台系统配置', 'platform_system_setting', 'system_setting', 'read', '查看平台级系统配置'),
    ('platform.system_setting.manage', '管理平台系统配置', 'platform_system_setting', 'system_setting', 'manage', '修改平台级系统配置'),
    ('platform.social_video.manage', '管理平台自媒体脚本', 'platform_social_video', 'social_video', 'manage', '使用平台自媒体脚本能力'),
    ('platform.location.manage', '管理平台运营区域', 'platform_location', 'location', 'manage', '维护平台行政区域和运营区域数据'),
    ('platform.ops.execute', '执行平台运维脚本', 'platform_ops', 'ops', 'execute', '执行平台运维脚本')
)
INSERT INTO public.permissions (code, name, module, resource, action, description, status)
SELECT code, name, module, resource, action, description, 'active'
FROM platform_permissions
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

WITH platform_roles(code, name, description) AS (
  VALUES
    ('platform_staff', '平台工作人员', '平台工作人员基础身份，不直接授予业务管理权限'),
    ('platform_operations', '综合运营', '租户、入驻、线索、内容和基础用量运营'),
    ('platform_supplier_operations', '供应商运营', '供应商准入、资质、商品目录和 OCR 操作'),
    ('platform_service_delivery', '服务交付', '技术服务订单、工单、履约记录和客户验收准备'),
    ('platform_finance_review', '财务审核', '订单、收入、退款申请和结算信息审核'),
    ('platform_technical_operations', '技术运维', '设备、OCR 策略、AI 路由和身份诊断')
),
updated AS (
  UPDATE public.roles AS roles
  SET
    name = platform_roles.name,
    description = platform_roles.description,
    status = 'active',
    updated_at = now()
  FROM platform_roles
  WHERE roles.tenant_id IS NULL
    AND roles.code = platform_roles.code
  RETURNING roles.code
)
INSERT INTO public.roles (tenant_id, code, name, description, status)
SELECT NULL, platform_roles.code, platform_roles.name, platform_roles.description, 'active'
FROM platform_roles
WHERE NOT EXISTS (
  SELECT 1
  FROM updated
  WHERE updated.code = platform_roles.code
)
  AND NOT EXISTS (
    SELECT 1
    FROM public.roles AS existing
    WHERE existing.tenant_id IS NULL
      AND existing.code = platform_roles.code
  );

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code LIKE 'platform.%'
  AND permissions.status = 'active'
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = 'all';

WITH role_permission_codes(role_code, permission_code) AS (
  VALUES
    ('platform_operations', 'platform.dashboard.read'),
    ('platform_operations', 'platform.tenant.read'),
    ('platform_operations', 'platform.tenant.manage'),
    ('platform_operations', 'platform.tenant.status.manage'),
    ('platform_operations', 'platform.tenant_onboarding.review'),
    ('platform_operations', 'platform.service_provider.publish'),
    ('platform_operations', 'platform.partner.read'),
    ('platform_operations', 'platform.partner.manage'),
    ('platform_operations', 'platform.lead.read'),
    ('platform_operations', 'platform.lead.assign'),
    ('platform_operations', 'platform.picture.read'),
    ('platform_operations', 'platform.picture.manage'),
    ('platform_operations', 'platform.marketing_page.read'),
    ('platform_operations', 'platform.marketing_page.manage'),
    ('platform_operations', 'platform.marketing_page.publish'),
    ('platform_operations', 'platform.site_content.read'),
    ('platform_operations', 'platform.site_content.manage'),
    ('platform_operations', 'platform.site_content.publish'),
    ('platform_operations', 'platform.usage.read'),
    ('platform_supplier_operations', 'platform.dashboard.read'),
    ('platform_supplier_operations', 'platform.supplier.view'),
    ('platform_supplier_operations', 'platform.supplier.review'),
    ('platform_supplier_operations', 'platform.supplier.manage'),
    ('platform_supplier_operations', 'platform.catalog.manage'),
    ('platform_supplier_operations', 'platform.ocr.recognize'),
    ('platform_supplier_operations', 'platform.ocr.recognition.read'),
    ('platform_service_delivery', 'platform.dashboard.read'),
    ('platform_service_delivery', 'platform.service_order.read'),
    ('platform_service_delivery', 'platform.service_work_order.manage'),
    ('platform_finance_review', 'platform.dashboard.read'),
    ('platform_finance_review', 'platform.billing.read'),
    ('platform_finance_review', 'platform.billing.recharge_refund.read'),
    ('platform_finance_review', 'platform.billing.recharge_refund.review'),
    ('platform_finance_review', 'platform.service_refund.review'),
    ('platform_finance_review', 'platform.branding_order.read'),
    ('platform_finance_review', 'platform.virtual_order.read'),
    ('platform_finance_review', 'platform.partner.revenue.read'),
    ('platform_finance_review', 'platform.partner.commission.read'),
    ('platform_technical_operations', 'platform.dashboard.read'),
    ('platform_technical_operations', 'platform.device.read'),
    ('platform_technical_operations', 'platform.device.manage'),
    ('platform_technical_operations', 'platform.ocr.recognition.read'),
    ('platform_technical_operations', 'platform.ocr.tenant_policy.manage'),
    ('platform_technical_operations', 'platform.ai_config.read'),
    ('platform_technical_operations', 'platform.ai_config.manage'),
    ('platform_technical_operations', 'platform.identity_diagnostic.read'),
    ('platform_technical_operations', 'platform.system_setting.read')
)
INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM role_permission_codes
JOIN public.roles
  ON roles.code = role_permission_codes.role_code
  AND roles.tenant_id IS NULL
JOIN public.permissions
  ON permissions.code = role_permission_codes.permission_code
  AND permissions.status = 'active'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = 'all';

CREATE FUNCTION public.guard_platform_employee_phone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.phone IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.phone := NULLIF(btrim(NEW.phone), '');

  IF NEW.phone IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtextextended('employee-phone:' || btrim(NEW.phone), 0)
  );

  IF NEW.tenant_id IS NULL AND EXISTS (
    SELECT 1 FROM public.employees AS existing
    WHERE existing.id <> NEW.id AND existing.phone = btrim(NEW.phone)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'PLATFORM_OPERATOR_PHONE_CONFLICT';
  END IF;

  IF NEW.tenant_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.employees AS existing
    WHERE existing.id <> NEW.id
      AND existing.tenant_id IS NULL
      AND existing.phone = btrim(NEW.phone)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'PLATFORM_OPERATOR_PHONE_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_platform_employee_phone ON public.employees;

CREATE TRIGGER tr_guard_platform_employee_phone
  BEFORE INSERT OR UPDATE OF phone, tenant_id ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_platform_employee_phone();

REVOKE ALL ON FUNCTION public.guard_platform_employee_phone() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_platform_employee_phone() TO service_role;
