-- Atomically creates one active tenant WeChat Pay applyment and its audit
-- event. The advisory lock gives a stable business conflict while the partial
-- unique index remains the database invariant.
--
-- Rollback:
-- 1. Block tenant applyment creation.
-- 2. DROP FUNCTION public.create_tenant_wechat_pay_applyment(jsonb, jsonb).
-- 3. DROP INDEX tenant_wechat_pay_applyments_one_active_per_tenant_idx.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tenant_wechat_pay_applyments
    WHERE status NOT IN ('closed', 'suspended')
    GROUP BY tenant_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_ACTIVE_DUPLICATES_EXIST';
  END IF;
END;
$$;

CREATE UNIQUE INDEX tenant_wechat_pay_applyments_one_active_per_tenant_idx
ON public.tenant_wechat_pay_applyments(tenant_id)
WHERE status NOT IN ('closed', 'suspended');

CREATE OR REPLACE FUNCTION public.create_tenant_wechat_pay_applyment(
  p_applyment jsonb,
  p_audit_metadata jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_applyment_id uuid;
  v_tenant_id uuid;
  v_employee_id uuid;
BEGIN
  IF auth.role() <> 'service_role' OR auth.role() IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_CREATE_FORBIDDEN';
  END IF;

  IF p_applyment IS NULL OR jsonb_typeof(p_applyment) <> 'object' OR
     p_audit_metadata IS NULL OR
     jsonb_typeof(p_audit_metadata) <> 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_CREATE_INVALID';
  END IF;

  v_applyment_id := (p_applyment ->> 'id')::uuid;
  v_tenant_id := (p_applyment ->> 'tenant_id')::uuid;
  v_employee_id := (p_applyment ->> 'created_by_employee_id')::uuid;
  IF v_applyment_id IS NULL OR v_tenant_id IS NULL OR
     v_employee_id IS NULL OR
     nullif(btrim(p_applyment ->> 'application_no'), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_CREATE_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text, 0));
  IF EXISTS (
    SELECT 1
    FROM public.tenant_wechat_pay_applyments
    WHERE tenant_id = v_tenant_id
      AND status NOT IN ('closed', 'suspended')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_EXISTS';
  END IF;

  INSERT INTO public.tenant_wechat_pay_applyments (
    id,
    tenant_id,
    application_no,
    status,
    subject_type,
    merchant_short_name,
    license_name,
    license_code,
    license_address,
    license_period_begin,
    license_period_end,
    legal_representative_name,
    identity_doc_type,
    identity_address_masked,
    identity_period_begin,
    identity_period_end,
    contact_type,
    super_admin_name,
    super_admin_phone_masked,
    super_admin_email,
    contact_identity_doc_type,
    contact_identity_period_begin,
    contact_identity_period_end,
    service_phone,
    settlement_account_type,
    settlement_account_name,
    settlement_bank_name,
    settlement_bank_full_name,
    settlement_bank_branch_id,
    settlement_account_number_masked,
    settlement_account_summary,
    settlement_id,
    qualification_type,
    business_scene_description,
    contact_address,
    attachments,
    remark,
    applyment_state,
    appid_binding_state,
    has_sensitive_payload,
    sensitive_payload_ciphertext,
    sensitive_payload_version,
    sensitive_payload_updated_at,
    created_by_employee_id,
    updated_by_employee_id,
    draft_revision,
    draft_epoch
  )
  VALUES (
    v_applyment_id,
    v_tenant_id,
    p_applyment ->> 'application_no',
    'draft',
    p_applyment ->> 'subject_type',
    p_applyment ->> 'merchant_short_name',
    p_applyment ->> 'license_name',
    p_applyment ->> 'license_code',
    p_applyment ->> 'license_address',
    nullif(p_applyment ->> 'license_period_begin', '')::date,
    p_applyment ->> 'license_period_end',
    p_applyment ->> 'legal_representative_name',
    p_applyment ->> 'identity_doc_type',
    p_applyment ->> 'identity_address_masked',
    nullif(p_applyment ->> 'identity_period_begin', '')::date,
    p_applyment ->> 'identity_period_end',
    p_applyment ->> 'contact_type',
    p_applyment ->> 'super_admin_name',
    p_applyment ->> 'super_admin_phone_masked',
    p_applyment ->> 'super_admin_email',
    p_applyment ->> 'contact_identity_doc_type',
    nullif(p_applyment ->> 'contact_identity_period_begin', '')::date,
    p_applyment ->> 'contact_identity_period_end',
    p_applyment ->> 'service_phone',
    p_applyment ->> 'settlement_account_type',
    p_applyment ->> 'settlement_account_name',
    p_applyment ->> 'settlement_bank_name',
    p_applyment ->> 'settlement_bank_full_name',
    p_applyment ->> 'settlement_bank_branch_id',
    p_applyment ->> 'settlement_account_number_masked',
    p_applyment ->> 'settlement_account_summary',
    p_applyment ->> 'settlement_id',
    p_applyment ->> 'qualification_type',
    p_applyment ->> 'business_scene_description',
    p_applyment ->> 'contact_address',
    coalesce(p_applyment -> 'attachments', '[]'::jsonb),
    p_applyment ->> 'remark',
    'draft',
    'not_bound',
    coalesce((p_applyment ->> 'has_sensitive_payload')::boolean, false),
    p_applyment ->> 'sensitive_payload_ciphertext',
    (p_applyment ->> 'sensitive_payload_version')::integer,
    (p_applyment ->> 'sensitive_payload_updated_at')::timestamptz,
    v_employee_id,
    coalesce(
      (p_applyment ->> 'updated_by_employee_id')::uuid,
      v_employee_id
    ),
    coalesce((p_applyment ->> 'draft_revision')::bigint, 1),
    coalesce((p_applyment ->> 'draft_epoch')::bigint, 1)
  );

  INSERT INTO public.tenant_wechat_pay_applyment_events (
    tenant_id,
    applyment_id,
    event_type,
    from_status,
    to_status,
    message,
    operator_employee_id,
    metadata
  )
  VALUES (
    v_tenant_id,
    v_applyment_id,
    'created',
    NULL,
    'draft',
    '租户创建微信支付开通申请草稿',
    v_employee_id,
    p_audit_metadata
  );

  RETURN v_applyment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_wechat_pay_applyment(
  jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_wechat_pay_applyment(
  jsonb, jsonb
) TO service_role;

COMMENT ON FUNCTION public.create_tenant_wechat_pay_applyment(jsonb, jsonb)
IS 'Atomically creates one active tenant applyment and its created audit event.';

COMMIT;
