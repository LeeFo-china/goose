-- Tencent OCR platform foundation: tenant-isolated records, permissions, and settings.

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
    'ocr.recognize',
    '使用证照识别',
    'ocr',
    'recognition',
    'create',
    '对当前租户有权限的业务附件发起证照识别',
    'active'
  ),
  (
    'platform.ocr.recognition.read',
    '查看平台OCR记录',
    'platform_ocr',
    'recognition',
    'read',
    '分页查看平台OCR调用记录和脱敏审计信息',
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
  ON permissions.code = 'ocr.recognize'
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code = 'platform.ocr.recognition.read'
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE TABLE public.ocr_recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  scene text NOT NULL,
  document_type text NOT NULL,
  provider text NOT NULL DEFAULT 'tencent_cloud',
  provider_action text NOT NULL,
  file_object_id uuid NOT NULL REFERENCES public.platform_file_objects(id),
  file_checksum text NULL,
  subject_type text NULL,
  subject_id uuid NULL,
  status text NOT NULL DEFAULT 'pending',
  idempotency_key uuid NOT NULL,
  dedupe_key text NOT NULL,
  result_ciphertext text NULL,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_request_id text NULL,
  provider_error_code text NULL,
  provider_error_message_safe text NULL,
  billable_units integer NOT NULL DEFAULT 0,
  duration_ms integer NULL,
  processed_at timestamptz NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocr_recognitions_scene_check CHECK (
    scene IN ('wechat_pay_applyment', 'expense_request', 'merchant_material')
  ),
  CONSTRAINT ocr_recognitions_document_type_check CHECK (
    document_type IN (
      'business_license',
      'id_card_front',
      'id_card_back',
      'bank_card',
      'general_invoice',
      'vat_invoice_verify',
      'store_name',
      'store_classification',
      'document_classification'
    )
  ),
  CONSTRAINT ocr_recognitions_provider_check CHECK (
    provider = 'tencent_cloud'
  ),
  CONSTRAINT ocr_recognitions_provider_action_not_blank CHECK (
    btrim(provider_action) <> ''
  ),
  CONSTRAINT ocr_recognitions_subject_pair_check CHECK (
    (subject_type IS NULL AND subject_id IS NULL)
    OR (btrim(subject_type) <> '' AND subject_id IS NOT NULL)
  ),
  CONSTRAINT ocr_recognitions_status_check CHECK (
    status IN ('pending', 'processing', 'succeeded', 'failed', 'expired')
  ),
  CONSTRAINT ocr_recognitions_dedupe_key_not_blank CHECK (
    btrim(dedupe_key) <> ''
  ),
  CONSTRAINT ocr_recognitions_result_summary_object_check CHECK (
    jsonb_typeof(result_summary) = 'object'
  ),
  CONSTRAINT ocr_recognitions_warnings_array_check CHECK (
    jsonb_typeof(warnings) = 'array'
  ),
  CONSTRAINT ocr_recognitions_quality_object_check CHECK (
    jsonb_typeof(quality) = 'object'
  ),
  CONSTRAINT ocr_recognitions_billable_units_check CHECK (
    billable_units >= 0
  ),
  CONSTRAINT ocr_recognitions_duration_ms_check CHECK (
    duration_ms IS NULL OR duration_ms >= 0
  )
);

CREATE UNIQUE INDEX ocr_recognitions_tenant_idempotency_idx
ON public.ocr_recognitions(tenant_id, idempotency_key);

CREATE UNIQUE INDEX ocr_recognitions_active_dedupe_idx
ON public.ocr_recognitions(tenant_id, dedupe_key)
WHERE status IN ('processing', 'succeeded');

CREATE INDEX ocr_recognitions_tenant_created_idx
ON public.ocr_recognitions(tenant_id, created_at DESC);

CREATE INDEX ocr_recognitions_status_created_idx
ON public.ocr_recognitions(status, created_at DESC);

CREATE INDEX ocr_recognitions_file_created_idx
ON public.ocr_recognitions(file_object_id, created_at DESC);

CREATE INDEX ocr_recognitions_expiry_idx
ON public.ocr_recognitions(expires_at)
WHERE status = 'succeeded';

DROP TRIGGER IF EXISTS tr_ocr_recognitions_updated_at
ON public.ocr_recognitions;

CREATE TRIGGER tr_ocr_recognitions_updated_at
BEFORE UPDATE ON public.ocr_recognitions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.ocr_recognitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_recognitions FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ocr_recognitions
IS '腾讯云OCR调用记录。敏感识别字段仅以短期密文保存，平台审计只读取脱敏摘要。';

COMMENT ON COLUMN public.ocr_recognitions.result_ciphertext
IS '使用服务端OCR_RESULT_ENCRYPTION_KEY加密的短期归一化识别结果。';

COMMENT ON COLUMN public.ocr_recognitions.result_summary
IS '不包含证件明文、完整地址或银行卡号的脱敏审计摘要。';

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
SELECT *
FROM (
  VALUES
    ('TENCENT_OCR_ENABLED', 'ocr', '启用腾讯云 OCR', '平台统一OCR服务总开关。', 'boolean', 'false', false, 'active'),
    ('TENCENT_OCR_SECRET_ID', 'ocr', '腾讯云 OCR SecretId', 'OCR专用CAM凭证SecretId，加密存储。', 'string', NULL, true, 'active'),
    ('TENCENT_OCR_SECRET_KEY', 'ocr', '腾讯云 OCR SecretKey', 'OCR专用CAM凭证SecretKey，加密存储。', 'string', NULL, true, 'active'),
    ('TENCENT_OCR_REGION', 'ocr', '腾讯云 OCR 地域', '腾讯云OCR客户端地域。', 'string', 'ap-guangzhou', false, 'active'),
    ('TENCENT_OCR_ENDPOINT', 'ocr', '腾讯云 OCR Endpoint', '腾讯云OCR API域名。', 'string', 'ocr.tencentcloudapi.com', false, 'active'),
    ('TENCENT_OCR_REQUEST_TIMEOUT_MS', 'ocr', 'OCR请求超时', '单次腾讯云OCR请求超时时间，单位毫秒。', 'number', '10000', false, 'active'),
    ('TENCENT_OCR_DEFAULT_TENANT_DAILY_LIMIT', 'ocr', '租户默认日额度', '每个租户每天可发起的OCR调用上限。', 'number', '100', false, 'active'),
    ('TENCENT_OCR_RESULT_TTL_HOURS', 'ocr', '识别结果保留小时数', '敏感识别结果密文的可读保留时间。', 'number', '24', false, 'active'),
    ('TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED', 'ocr', '启用加密身份证识别', '仅允许使用腾讯云加密身份证接口。', 'boolean', 'true', false, 'active'),
    ('TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM', 'ocr', 'OCR加密公钥', '腾讯OCR提供的身份证加密RSA公钥PEM，按敏感配置存储。', 'string', NULL, true, 'active'),
    ('TENCENT_OCR_ENCRYPTION_ALGORITHM', 'ocr', '身份证加密算法', 'Phase 1固定为AES-256-CBC。', 'string', 'AES-256-CBC', false, 'active')
) AS incoming (
  key,
  group_code,
  name,
  description,
  value_type,
  value_text,
  is_secret,
  status
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings existing
  WHERE existing.tenant_id IS NULL
    AND existing.key = incoming.key
);

UPDATE public.system_settings existing
SET
  group_code = incoming.group_code,
  name = incoming.name,
  description = incoming.description,
  value_type = incoming.value_type,
  is_secret = incoming.is_secret,
  status = incoming.status,
  updated_at = now()
FROM (
  VALUES
    ('TENCENT_OCR_ENABLED', 'ocr', '启用腾讯云 OCR', '平台统一OCR服务总开关。', 'boolean', false, 'active'),
    ('TENCENT_OCR_SECRET_ID', 'ocr', '腾讯云 OCR SecretId', 'OCR专用CAM凭证SecretId，加密存储。', 'string', true, 'active'),
    ('TENCENT_OCR_SECRET_KEY', 'ocr', '腾讯云 OCR SecretKey', 'OCR专用CAM凭证SecretKey，加密存储。', 'string', true, 'active'),
    ('TENCENT_OCR_REGION', 'ocr', '腾讯云 OCR 地域', '腾讯云OCR客户端地域。', 'string', false, 'active'),
    ('TENCENT_OCR_ENDPOINT', 'ocr', '腾讯云 OCR Endpoint', '腾讯云OCR API域名。', 'string', false, 'active'),
    ('TENCENT_OCR_REQUEST_TIMEOUT_MS', 'ocr', 'OCR请求超时', '单次腾讯云OCR请求超时时间，单位毫秒。', 'number', false, 'active'),
    ('TENCENT_OCR_DEFAULT_TENANT_DAILY_LIMIT', 'ocr', '租户默认日额度', '每个租户每天可发起的OCR调用上限。', 'number', false, 'active'),
    ('TENCENT_OCR_RESULT_TTL_HOURS', 'ocr', '识别结果保留小时数', '敏感识别结果密文的可读保留时间。', 'number', false, 'active'),
    ('TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED', 'ocr', '启用加密身份证识别', '仅允许使用腾讯云加密身份证接口。', 'boolean', false, 'active'),
    ('TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM', 'ocr', 'OCR加密公钥', '腾讯OCR提供的身份证加密RSA公钥PEM，按敏感配置存储。', 'string', true, 'active'),
    ('TENCENT_OCR_ENCRYPTION_ALGORITHM', 'ocr', '身份证加密算法', 'Phase 1固定为AES-256-CBC。', 'string', false, 'active')
) AS incoming (
  key,
  group_code,
  name,
  description,
  value_type,
  is_secret,
  status
)
WHERE existing.tenant_id IS NULL
  AND existing.key = incoming.key;
