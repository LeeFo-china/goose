-- Add the persistence, permissions, and submission lease required by the
-- official WeChat Pay partner applyment API.
--
-- Rollback must be a forward migration. Only remove these columns and the
-- media table after all official applyments are closed and encrypted payloads
-- have been securely retired.

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
    'platform.wechat_pay.applyment.submit',
    '平台提交微信支付正式进件',
    'platform_wechat_pay',
    'applyment',
    'submit',
    '向微信支付提交已通过平台审核的正式特约商户申请',
    'active'
  ),
  (
    'platform.wechat_pay.applyment.sync',
    '平台同步微信支付进件状态',
    'platform_wechat_pay',
    'applyment',
    'sync',
    '从微信支付同步正式进件状态和审核结果',
    'active'
  ),
  (
    'platform.wechat_pay.applyment.repair',
    '平台修复微信支付进件状态',
    'platform_wechat_pay',
    'applyment',
    'repair',
    '受控修复异常进件状态，默认不授予任何角色',
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
    'platform.wechat_pay.applyment.submit',
    'platform.wechat_pay.applyment.sync'
  )
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

ALTER TABLE public.tenant_wechat_pay_applyments
  ADD COLUMN IF NOT EXISTS subject_type text NULL,
  ADD COLUMN IF NOT EXISTS license_address text NULL,
  ADD COLUMN IF NOT EXISTS license_period_begin date NULL,
  ADD COLUMN IF NOT EXISTS license_period_end text NULL,
  ADD COLUMN IF NOT EXISTS identity_doc_type text NULL,
  ADD COLUMN IF NOT EXISTS identity_address_masked text NULL,
  ADD COLUMN IF NOT EXISTS identity_period_begin date NULL,
  ADD COLUMN IF NOT EXISTS identity_period_end text NULL,
  ADD COLUMN IF NOT EXISTS contact_type text NULL,
  ADD COLUMN IF NOT EXISTS contact_identity_doc_type text NULL,
  ADD COLUMN IF NOT EXISTS contact_identity_period_begin date NULL,
  ADD COLUMN IF NOT EXISTS contact_identity_period_end text NULL,
  ADD COLUMN IF NOT EXISTS service_phone text NULL,
  ADD COLUMN IF NOT EXISTS settlement_id text NULL,
  ADD COLUMN IF NOT EXISTS qualification_type text NULL,
  ADD COLUMN IF NOT EXISTS sensitive_payload_ciphertext text NULL,
  ADD COLUMN IF NOT EXISTS sensitive_payload_version integer NULL,
  ADD COLUMN IF NOT EXISTS sensitive_payload_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS has_sensitive_payload boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wechat_applyment_state_raw text NULL,
  ADD COLUMN IF NOT EXISTS sign_url text NULL,
  ADD COLUMN IF NOT EXISTS audit_detail jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_wechat_request_id text NULL,
  ADD COLUMN IF NOT EXISTS last_wechat_synced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS submission_claimed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS submission_attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.tenant_wechat_pay_applyments
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_status_check,
  ADD CONSTRAINT tenant_wechat_pay_applyments_status_check
  CHECK (
    status IN (
      'draft',
      'submitted',
      'rejected',
      'approved',
      'applying',
      'wechat_editing',
      'reviewing',
      'account_verifying',
      'signing',
      'opening',
      'opened',
      'bound',
      'active',
      'suspended',
      'closed'
    )
  ),
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_subject_type_check,
  ADD CONSTRAINT tenant_wechat_pay_applyments_subject_type_check
  CHECK (
    subject_type IS NULL OR
    subject_type IN ('SUBJECT_TYPE_ENTERPRISE', 'SUBJECT_TYPE_INDIVIDUAL')
  ),
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_identity_doc_type_check,
  ADD CONSTRAINT tenant_wechat_pay_applyments_identity_doc_type_check
  CHECK (
    identity_doc_type IS NULL OR
    identity_doc_type = 'IDENTIFICATION_TYPE_IDCARD'
  ),
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_contact_type_check,
  ADD CONSTRAINT tenant_wechat_pay_applyments_contact_type_check
  CHECK (contact_type IS NULL OR contact_type IN ('LEGAL', 'SUPER')),
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_contact_identity_doc_type_check,
  ADD CONSTRAINT tenant_wechat_pay_applyments_contact_identity_doc_type_check
  CHECK (
    contact_identity_doc_type IS NULL OR
    contact_identity_doc_type = 'IDENTIFICATION_TYPE_IDCARD'
  ),
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_sensitive_payload_check,
  ADD CONSTRAINT tenant_wechat_pay_applyments_sensitive_payload_check
  CHECK (
    (
      has_sensitive_payload = false AND
      sensitive_payload_ciphertext IS NULL AND
      sensitive_payload_version IS NULL
    ) OR (
      has_sensitive_payload = true AND
      sensitive_payload_ciphertext IS NOT NULL AND
      btrim(sensitive_payload_ciphertext) <> '' AND
      sensitive_payload_version IS NOT NULL AND
      sensitive_payload_version > 0
    )
  ),
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_audit_detail_array_check,
  ADD CONSTRAINT tenant_wechat_pay_applyments_audit_detail_array_check
  CHECK (jsonb_typeof(audit_detail) = 'array'),
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_submission_attempt_count_check,
  ADD CONSTRAINT tenant_wechat_pay_applyments_submission_attempt_count_check
  CHECK (submission_attempt_count >= 0),
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_official_text_not_blank,
  ADD CONSTRAINT tenant_wechat_pay_applyments_official_text_not_blank
  CHECK (
    (license_address IS NULL OR btrim(license_address) <> '') AND
    (license_period_end IS NULL OR btrim(license_period_end) <> '') AND
    (identity_address_masked IS NULL OR btrim(identity_address_masked) <> '') AND
    (identity_period_end IS NULL OR btrim(identity_period_end) <> '') AND
    (contact_identity_period_end IS NULL OR btrim(contact_identity_period_end) <> '') AND
    (service_phone IS NULL OR btrim(service_phone) <> '') AND
    (settlement_id IS NULL OR btrim(settlement_id) <> '') AND
    (qualification_type IS NULL OR btrim(qualification_type) <> '') AND
    (wechat_applyment_state_raw IS NULL OR btrim(wechat_applyment_state_raw) <> '') AND
    (sign_url IS NULL OR btrim(sign_url) <> '') AND
    (last_wechat_request_id IS NULL OR btrim(last_wechat_request_id) <> '')
  );

CREATE TABLE IF NOT EXISTS public.tenant_wechat_pay_applyment_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  applyment_id uuid NOT NULL
    REFERENCES public.tenant_wechat_pay_applyments(id) ON DELETE CASCADE,
  category text NOT NULL,
  object_key text NOT NULL,
  sha256 text NOT NULL,
  media_id text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  request_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_wechat_pay_applyment_media_category_not_blank
    CHECK (btrim(category) <> ''),
  CONSTRAINT tenant_wechat_pay_applyment_media_object_key_not_blank
    CHECK (btrim(object_key) <> ''),
  CONSTRAINT tenant_wechat_pay_applyment_media_sha256_check
    CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT tenant_wechat_pay_applyment_media_media_id_not_blank
    CHECK (btrim(media_id) <> ''),
  CONSTRAINT tenant_wechat_pay_applyment_media_mime_type_not_blank
    CHECK (btrim(mime_type) <> ''),
  CONSTRAINT tenant_wechat_pay_applyment_media_size_bytes_check
    CHECK (size_bytes > 0 AND size_bytes <= 2097152),
  CONSTRAINT tenant_wechat_pay_applyment_media_request_id_not_blank
    CHECK (request_id IS NULL OR btrim(request_id) <> ''),
  UNIQUE (applyment_id, object_key, sha256)
);

CREATE INDEX IF NOT EXISTS tenant_wechat_pay_applyment_media_applyment_category_idx
ON public.tenant_wechat_pay_applyment_media(applyment_id, category, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS tenant_wechat_pay_applyment_media_tenant_created_idx
ON public.tenant_wechat_pay_applyment_media(tenant_id, created_at DESC);

DROP TRIGGER IF EXISTS tr_tenant_wechat_pay_applyment_media_updated_at
ON public.tenant_wechat_pay_applyment_media;

CREATE TRIGGER tr_tenant_wechat_pay_applyment_media_updated_at
  BEFORE UPDATE ON public.tenant_wechat_pay_applyment_media
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_wechat_pay_applyment_media ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_wechat_pay_applyment_media
FROM PUBLIC, anon, authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.tenant_wechat_pay_applyment_media FROM service_role;
GRANT SELECT, INSERT, UPDATE
ON TABLE public.tenant_wechat_pay_applyment_media TO service_role;

CREATE OR REPLACE FUNCTION public.claim_wechat_pay_applyment_submission(
  p_applyment_id uuid,
  p_employee_id uuid
)
RETURNS SETOF public.tenant_wechat_pay_applyments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_applyment public.tenant_wechat_pay_applyments%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_applyment_id IS NULL OR p_employee_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_SUBMISSION_CLAIM_INVALID';
  END IF;

  SELECT applyment.*
  INTO v_applyment
  FROM public.tenant_wechat_pay_applyments AS applyment
  WHERE applyment.id = p_applyment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_NOT_FOUND';
  END IF;

  IF v_applyment.status NOT IN ('approved', 'wechat_editing', 'applying') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_SUBMISSION_STATE_INVALID';
  END IF;

  IF v_applyment.status = 'applying'
    AND v_applyment.submission_claimed_at IS NOT NULL
    AND v_applyment.submission_claimed_at > v_now - interval '5 minutes'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55P03',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_SUBMISSION_IN_PROGRESS';
  END IF;

  UPDATE public.tenant_wechat_pay_applyments AS applyment
  SET
    status = 'applying',
    submission_claimed_at = v_now,
    submission_attempt_count = applyment.submission_attempt_count + 1,
    updated_by_employee_id = p_employee_id,
    updated_at = v_now
  WHERE applyment.id = p_applyment_id
  RETURNING applyment.* INTO v_applyment;

  RETURN NEXT v_applyment;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_wechat_pay_applyment_submission(uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_wechat_pay_applyment_submission(uuid, uuid)
TO service_role;

COMMENT ON TABLE public.tenant_wechat_pay_applyment_media
IS 'Reusable WeChat Pay MediaID mappings for private applyment attachments.';
COMMENT ON COLUMN public.tenant_wechat_pay_applyments.sensitive_payload_ciphertext
IS 'AES-256-GCM ciphertext for official applyment fields; never expose through APIs.';
COMMENT ON COLUMN public.tenant_wechat_pay_applyments.wechat_applyment_state_raw
IS 'Unmodified APPLYMENT_STATE_* value returned by WeChat Pay.';
COMMENT ON FUNCTION public.claim_wechat_pay_applyment_submission(uuid, uuid)
IS 'Atomically claims a five-minute lease before an official applyment submission.';

COMMIT;
