-- Rollback: drop platform supplier onboarding OCR data first, then remove
-- platform-only indexes, constraints, settings, permissions, supplier columns,
-- and restore tenant_id NOT NULL with the original tenant-only indexes.

BEGIN;

ALTER TABLE public.ocr_recognitions ADD COLUMN scope_type text NOT NULL DEFAULT 'tenant';

ALTER TABLE public.ocr_recognitions ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE public.ocr_recognitions
DROP CONSTRAINT IF EXISTS ocr_recognitions_scope_type_check;

ALTER TABLE public.ocr_recognitions
ADD CONSTRAINT ocr_recognitions_scope_type_check
CHECK (scope_type IN ('tenant', 'platform'));

ALTER TABLE public.ocr_recognitions
DROP CONSTRAINT IF EXISTS ocr_recognitions_scope_tenant_check;

ALTER TABLE public.ocr_recognitions
ADD CONSTRAINT ocr_recognitions_scope_tenant_check
CHECK (
  (scope_type = 'tenant' AND tenant_id IS NOT NULL)
  OR (scope_type = 'platform' AND tenant_id IS NULL)
);

ALTER TABLE public.ocr_recognitions
DROP CONSTRAINT IF EXISTS ocr_recognitions_scene_check;

ALTER TABLE public.ocr_recognitions
ADD CONSTRAINT ocr_recognitions_scene_check
CHECK (
  scene IN (
    'wechat_pay_applyment',
    'expense_request',
    'merchant_material',
    'supplier_onboarding'
  )
);

DROP INDEX IF EXISTS public.ocr_recognitions_tenant_idempotency_idx;
DROP INDEX IF EXISTS public.ocr_recognitions_active_dedupe_idx;

CREATE UNIQUE INDEX ocr_recognitions_tenant_idempotency_idx
ON public.ocr_recognitions(tenant_id, idempotency_key)
WHERE scope_type = 'tenant';

CREATE UNIQUE INDEX ocr_recognitions_platform_idempotency_idx
ON public.ocr_recognitions(actor_employee_id, idempotency_key)
WHERE scope_type = 'platform';

CREATE UNIQUE INDEX ocr_recognitions_tenant_active_dedupe_idx
ON public.ocr_recognitions(tenant_id, dedupe_key)
WHERE scope_type = 'tenant'
  AND status IN ('processing', 'succeeded');

CREATE UNIQUE INDEX ocr_recognitions_platform_active_dedupe_idx
ON public.ocr_recognitions(dedupe_key)
WHERE scope_type = 'platform'
  AND status IN ('processing', 'succeeded');

CREATE INDEX ocr_recognitions_scope_created_idx
ON public.ocr_recognitions(scope_type, created_at DESC, id DESC);

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
  'platform.ocr.recognize',
  '使用平台证照识别',
  'platform_ocr',
  'recognition',
  'create',
  '平台管理员发起供应商营业执照等平台证照识别',
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
  ON permissions.code = 'platform.ocr.recognize'
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.system_settings (
  key,
  group_code,
  name,
  description,
  value_type,
  value_text,
  is_secret,
  status
)
SELECT
  'TENCENT_OCR_PLATFORM_DAILY_LIMIT',
  'ocr',
  '平台OCR日额度',
  '平台级供应商准入等证照识别每日调用上限。',
  'number',
  '100',
  false,
  'active'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings existing
  WHERE existing.tenant_id IS NULL
    AND existing.key = 'TENCENT_OCR_PLATFORM_DAILY_LIMIT'
);

UPDATE public.system_settings
SET
  group_code = 'ocr',
  name = '平台OCR日额度',
  description = '平台级供应商准入等证照识别每日调用上限。',
  value_type = 'number',
  is_secret = false,
  status = 'active',
  updated_at = now()
WHERE tenant_id IS NULL
  AND key = 'TENCENT_OCR_PLATFORM_DAILY_LIMIT';

ALTER TABLE public.suppliers
ADD COLUMN legal_representative_name text NULL,
ADD COLUMN registered_address_text text NULL;

ALTER TABLE public.suppliers
DROP CONSTRAINT IF EXISTS suppliers_legal_representative_name_not_blank_check;

ALTER TABLE public.suppliers
ADD CONSTRAINT suppliers_legal_representative_name_not_blank_check
CHECK (legal_representative_name IS NULL OR btrim(legal_representative_name) <> '');

ALTER TABLE public.suppliers
DROP CONSTRAINT IF EXISTS suppliers_registered_address_text_not_blank_check;

ALTER TABLE public.suppliers
ADD CONSTRAINT suppliers_registered_address_text_not_blank_check
CHECK (registered_address_text IS NULL OR btrim(registered_address_text) <> '');

COMMIT;
