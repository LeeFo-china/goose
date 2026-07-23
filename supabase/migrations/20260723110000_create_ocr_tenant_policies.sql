-- Tenant-scoped OCR rollout control plane. Platform settings remain the global kill switch.

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
  'platform.ocr.tenant_policy.manage',
  '管理OCR租户灰度',
  'platform_ocr',
  'tenant_policy',
  'manage',
  '配置租户OCR灰度状态、允许的证照类型和每日额度',
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
  ON permissions.code = 'platform.ocr.tenant_policy.manage'
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE TABLE public.ocr_tenant_policies (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  allowed_document_types text[] NOT NULL DEFAULT '{}'::text[],
  daily_limit integer NULL,
  remark text NULL,
  enabled_at timestamptz NULL,
  updated_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocr_tenant_policies_document_types_check CHECK (
    allowed_document_types <@ ARRAY[
      'business_license',
      'id_card_front',
      'id_card_back',
      'bank_card'
    ]::text[]
    AND array_position(allowed_document_types, NULL) IS NULL
  ),
  CONSTRAINT ocr_tenant_policies_enabled_capabilities_check CHECK (
    NOT enabled OR cardinality(allowed_document_types) > 0
  ),
  CONSTRAINT ocr_tenant_policies_daily_limit_check CHECK (
    daily_limit IS NULL OR daily_limit BETWEEN 1 AND 10000
  ),
  CONSTRAINT ocr_tenant_policies_remark_length_check CHECK (
    remark IS NULL OR char_length(remark) <= 500
  )
);

CREATE INDEX ocr_tenant_policies_enabled_updated_idx
ON public.ocr_tenant_policies(enabled, updated_at DESC);

CREATE TRIGGER tr_ocr_tenant_policies_updated_at
BEFORE UPDATE ON public.ocr_tenant_policies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ocr_tenant_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_tenant_policies FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ocr_tenant_policies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ocr_tenant_policies TO service_role;

CREATE VIEW public.platform_ocr_tenant_policy_overview
WITH (security_invoker = true)
AS
SELECT
  tenants.id AS tenant_id,
  tenants.name AS tenant_name,
  tenants.slug AS tenant_slug,
  tenants.status AS tenant_status,
  policies.tenant_id IS NOT NULL AS configured,
  COALESCE(policies.enabled, false) AS enabled,
  COALESCE(policies.allowed_document_types, '{}'::text[]) AS allowed_document_types,
  policies.daily_limit,
  policies.remark,
  policies.enabled_at,
  policies.updated_by_employee_id,
  policies.created_at,
  policies.updated_at
FROM public.tenants
LEFT JOIN public.ocr_tenant_policies AS policies
  ON policies.tenant_id = tenants.id;

REVOKE ALL ON TABLE public.platform_ocr_tenant_policy_overview
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_ocr_tenant_policy_overview TO service_role;
