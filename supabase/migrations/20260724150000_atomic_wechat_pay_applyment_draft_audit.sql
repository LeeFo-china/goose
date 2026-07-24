-- Rollback:
-- 1. Block tenant draft writes during rollback.
-- 2. Drop the seven-argument update_tenant_wechat_pay_applyment_draft.
-- 3. Recreate the six-argument function from migration 20260724130000.
-- Rolling back removes atomic draft audit writes and must not be done while
-- application instances can call the seven-argument RPC.

BEGIN;

DROP FUNCTION public.update_tenant_wechat_pay_applyment_draft(
  uuid, uuid, uuid, bigint, bigint, jsonb
);

CREATE OR REPLACE FUNCTION public.update_tenant_wechat_pay_applyment_draft(
  p_applyment_id uuid,
  p_tenant_id uuid,
  p_employee_id uuid,
  p_epoch bigint,
  p_revision bigint,
  p_patch jsonb,
  p_audit_metadata jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_applyment public.tenant_wechat_pay_applyments%ROWTYPE;
  v_patch public.tenant_wechat_pay_applyments%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' OR auth.role() IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_DRAFT_UPDATE_FORBIDDEN';
  END IF;

  IF p_applyment_id IS NULL OR p_tenant_id IS NULL OR
     p_employee_id IS NULL OR p_epoch IS NULL OR p_epoch <= 0 OR
     p_revision IS NULL OR p_revision <= 0 OR p_patch IS NULL OR
     jsonb_typeof(p_patch) <> 'object' OR
     (
       p_audit_metadata IS NOT NULL AND
       jsonb_typeof(p_audit_metadata) <> 'object'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_DRAFT_UPDATE_INVALID';
  END IF;

  SELECT applyment.*
  INTO v_applyment
  FROM public.tenant_wechat_pay_applyments AS applyment
  WHERE applyment.id = p_applyment_id
    AND applyment.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_NOT_FOUND';
  END IF;

  IF p_epoch <> v_applyment.draft_epoch THEN
    RETURN 'stale_epoch';
  END IF;

  IF p_revision <= v_applyment.draft_revision THEN
    RETURN 'same_or_older_revision';
  END IF;

  IF v_applyment.status NOT IN ('draft', 'rejected', 'wechat_editing') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_NOT_EDITABLE';
  END IF;

  v_patch := jsonb_populate_record(v_applyment, p_patch);

  UPDATE public.tenant_wechat_pay_applyments
  SET
    subject_type = v_patch.subject_type,
    merchant_short_name = v_patch.merchant_short_name,
    license_name = v_patch.license_name,
    license_code = v_patch.license_code,
    license_address = v_patch.license_address,
    license_period_begin = v_patch.license_period_begin,
    license_period_end = v_patch.license_period_end,
    legal_representative_name = v_patch.legal_representative_name,
    identity_doc_type = v_patch.identity_doc_type,
    identity_address_masked = v_patch.identity_address_masked,
    identity_period_begin = v_patch.identity_period_begin,
    identity_period_end = v_patch.identity_period_end,
    contact_type = v_patch.contact_type,
    super_admin_name = v_patch.super_admin_name,
    super_admin_phone_masked = v_patch.super_admin_phone_masked,
    super_admin_email = v_patch.super_admin_email,
    contact_identity_doc_type = v_patch.contact_identity_doc_type,
    contact_identity_period_begin = v_patch.contact_identity_period_begin,
    contact_identity_period_end = v_patch.contact_identity_period_end,
    service_phone = v_patch.service_phone,
    settlement_account_type = v_patch.settlement_account_type,
    settlement_account_name = v_patch.settlement_account_name,
    settlement_bank_name = v_patch.settlement_bank_name,
    settlement_bank_full_name = v_patch.settlement_bank_full_name,
    settlement_bank_branch_id = v_patch.settlement_bank_branch_id,
    settlement_account_number_masked =
      v_patch.settlement_account_number_masked,
    settlement_account_summary = v_patch.settlement_account_summary,
    settlement_id = v_patch.settlement_id,
    qualification_type = v_patch.qualification_type,
    business_scene_description = v_patch.business_scene_description,
    contact_address = v_patch.contact_address,
    attachments = v_patch.attachments,
    remark = v_patch.remark,
    has_sensitive_payload = v_patch.has_sensitive_payload,
    sensitive_payload_ciphertext = v_patch.sensitive_payload_ciphertext,
    sensitive_payload_version = v_patch.sensitive_payload_version,
    sensitive_payload_updated_at = v_patch.sensitive_payload_updated_at,
    status = 'draft',
    applyment_state = 'draft',
    rejected_reason = NULL,
    rejected_at = NULL,
    updated_by_employee_id = p_employee_id,
    draft_revision = p_revision
  WHERE id = p_applyment_id
    AND tenant_id = p_tenant_id;

  IF p_audit_metadata IS NOT NULL THEN
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
      p_tenant_id,
      p_applyment_id,
      'updated',
      v_applyment.status,
      'draft',
      '租户更新微信支付开通申请资料',
      p_employee_id,
      p_audit_metadata
    );
  END IF;

  -- An unhandled event insert failure aborts this RPC statement, rolling back
  -- the draft row and encrypted sensitive payload changes above.
  RETURN 'applied';
END;
$$;

REVOKE ALL ON FUNCTION public.update_tenant_wechat_pay_applyment_draft(
  uuid, uuid, uuid, bigint, bigint, jsonb, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_tenant_wechat_pay_applyment_draft(
  uuid, uuid, uuid, bigint, bigint, jsonb, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.update_tenant_wechat_pay_applyment_draft(
  uuid, uuid, uuid, bigint, bigint, jsonb, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_wechat_pay_applyment_draft(
  uuid, uuid, uuid, bigint, bigint, jsonb, jsonb
) TO service_role;

COMMENT ON FUNCTION public.update_tenant_wechat_pay_applyment_draft(
  uuid, uuid, uuid, bigint, bigint, jsonb, jsonb
)
IS 'Atomically applies a current-epoch draft revision and its optional updated audit event.';

COMMIT;
