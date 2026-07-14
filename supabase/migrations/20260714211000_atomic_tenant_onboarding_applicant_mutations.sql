-- Make applicant submission, SMS consumption, status changes, and review events
-- transactional. Rollback: revoke/drop the three RPCs, then restore the previous
-- SMS scene constraint only after proving no rows use the new scene.

BEGIN;

ALTER TABLE public.sms_verification_codes
DROP CONSTRAINT IF EXISTS sms_verification_codes_scene_check;

ALTER TABLE public.sms_verification_codes
ADD CONSTRAINT sms_verification_codes_scene_check CHECK (
  scene IN (
    'bind_customer',
    'bind_employee',
    'admin_login',
    'rebind_wechat',
    'bind_platform_partner',
    'unbind_platform_partner',
    'rebind_platform_partner',
    'partner_application',
    'partner_tenant_onboarding',
    'tenant_onboarding_application'
  )
);

CREATE OR REPLACE FUNCTION public.submit_tenant_onboarding_application(
  p_application jsonb,
  p_sms_code_id uuid,
  p_sms_phone text,
  p_now timestamptz
)
RETURNS TABLE(application_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_application_id uuid;
  v_constraint_name text;
  v_allowed_keys constant text[] := ARRAY[
    'application_no', 'visitor_id', 'visitor_context_id', 'company_name',
    'unified_social_credit_code', 'business_license_file_id', 'admin_name',
    'admin_phone', 'address_province', 'address_city', 'address_district',
    'address_region_code', 'address', 'address_latitude', 'address_longitude',
    'service_region_codes', 'source_channel', 'invite_code_id',
    'candidate_partner_id', 'candidate_match_reason', 'candidate_snapshot',
    'partner_assist_status', 'partner_assist_requested_at',
    'partner_assist_due_at', 'privacy_policy_version',
    'onboarding_terms_version', 'consented_at', 'idempotency_key'
  ];
BEGIN
  IF jsonb_typeof(p_application) IS DISTINCT FROM 'object'
    OR p_application - v_allowed_keys <> '{}'::jsonb
    OR NULLIF(btrim(p_application->>'visitor_id'), '') IS NULL
    OR NULLIF(btrim(p_application->>'idempotency_key'), '') IS NULL
    OR p_application->>'admin_phone' IS DISTINCT FROM p_sms_phone
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_ONBOARDING_APPLICATION_PAYLOAD_INVALID';
  END IF;

  SELECT application.id
  INTO v_application_id
  FROM public.tenant_onboarding_applications AS application
  WHERE application.visitor_id = p_application->>'visitor_id'
    AND application.idempotency_key = p_application->>'idempotency_key';

  IF v_application_id IS NOT NULL THEN
    RETURN QUERY SELECT v_application_id, false;
    RETURN;
  END IF;

  BEGIN
    UPDATE public.sms_verification_codes AS sms
    SET status = 'verified', verified_at = p_now
    WHERE sms.id = p_sms_code_id
      AND sms.phone = p_sms_phone
      AND sms.scene = 'tenant_onboarding_application'
      AND sms.status = 'pending'
      AND sms.expired_at > p_now
    RETURNING sms.id INTO v_application_id;

    IF v_application_id IS NULL THEN
      SELECT application.id
      INTO v_application_id
      FROM public.tenant_onboarding_applications AS application
      WHERE application.visitor_id = p_application->>'visitor_id'
        AND application.idempotency_key = p_application->>'idempotency_key';

      IF v_application_id IS NOT NULL THEN
        RETURN QUERY SELECT v_application_id, false;
        RETURN;
      END IF;

      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'TENANT_ONBOARDING_SMS_INVALID';
    END IF;

    INSERT INTO public.tenant_onboarding_applications (
      application_no, visitor_id, visitor_context_id, company_name,
      unified_social_credit_code, business_license_file_id, admin_name,
      admin_phone, address_province, address_city, address_district,
      address_region_code, address, address_latitude, address_longitude,
      service_region_codes, source_channel, invite_code_id,
      candidate_partner_id, candidate_match_reason, candidate_snapshot,
      partner_assist_status, partner_assist_requested_at,
      partner_assist_due_at, privacy_policy_version, onboarding_terms_version,
      consented_at, idempotency_key
    ) VALUES (
      p_application->>'application_no',
      p_application->>'visitor_id',
      NULLIF(p_application->>'visitor_context_id', '')::uuid,
      p_application->>'company_name',
      p_application->>'unified_social_credit_code',
      (p_application->>'business_license_file_id')::uuid,
      p_application->>'admin_name',
      p_application->>'admin_phone',
      p_application->>'address_province',
      p_application->>'address_city',
      p_application->>'address_district',
      p_application->>'address_region_code',
      p_application->>'address',
      (p_application->>'address_latitude')::double precision,
      (p_application->>'address_longitude')::double precision,
      ARRAY(SELECT jsonb_array_elements_text(p_application->'service_region_codes')),
      p_application->>'source_channel',
      NULLIF(p_application->>'invite_code_id', '')::uuid,
      NULLIF(p_application->>'candidate_partner_id', '')::uuid,
      p_application->>'candidate_match_reason',
      COALESCE(p_application->'candidate_snapshot', '{}'::jsonb),
      p_application->>'partner_assist_status',
      NULLIF(p_application->>'partner_assist_requested_at', '')::timestamptz,
      NULLIF(p_application->>'partner_assist_due_at', '')::timestamptz,
      p_application->>'privacy_policy_version',
      p_application->>'onboarding_terms_version',
      (p_application->>'consented_at')::timestamptz,
      p_application->>'idempotency_key'
    )
    RETURNING id INTO v_application_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name = 'tenant_onboarding_applications_visitor_idempotency_unique' THEN
      SELECT application.id
      INTO v_application_id
      FROM public.tenant_onboarding_applications AS application
      WHERE application.visitor_id = p_application->>'visitor_id'
        AND application.idempotency_key = p_application->>'idempotency_key';
      IF v_application_id IS NOT NULL THEN
        RETURN QUERY SELECT v_application_id, false;
        RETURN;
      END IF;
    END IF;
    RAISE;
  END;

  RETURN QUERY SELECT v_application_id, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.supplement_tenant_onboarding_application(
  p_application_id uuid,
  p_visitor_id text,
  p_expected_version integer,
  p_patch jsonb,
  p_replace_candidate boolean,
  p_candidate_partner_id uuid,
  p_candidate_match_reason text,
  p_candidate_snapshot jsonb,
  p_partner_assist_status text,
  p_partner_assist_requested_at timestamptz,
  p_partner_assist_due_at timestamptz,
  p_now timestamptz
)
RETURNS TABLE(application_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_before_status text;
  v_before_assist_status text;
  v_after_id uuid;
  v_after_status text;
  v_after_assist_status text;
  v_after_version integer;
  v_allowed_keys constant text[] := ARRAY[
    'company_name', 'unified_social_credit_code', 'business_license_file_id',
    'admin_name', 'address_province', 'address_city', 'address_district',
    'address_region_code', 'address', 'address_latitude', 'address_longitude',
    'service_region_codes'
  ];
BEGIN
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
    OR p_patch - v_allowed_keys <> '{}'::jsonb
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_ONBOARDING_SUPPLEMENT_PAYLOAD_INVALID';
  END IF;

  SELECT application.status, application.partner_assist_status
  INTO v_before_status, v_before_assist_status
  FROM public.tenant_onboarding_applications AS application
  WHERE application.id = p_application_id
    AND application.visitor_id = p_visitor_id
    AND application.status = 'supplement_required'
    AND application.version = p_expected_version
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.tenant_onboarding_applications AS application
  SET company_name = CASE WHEN p_patch ? 'company_name' THEN p_patch->>'company_name' ELSE application.company_name END,
      unified_social_credit_code = CASE WHEN p_patch ? 'unified_social_credit_code' THEN p_patch->>'unified_social_credit_code' ELSE application.unified_social_credit_code END,
      business_license_file_id = CASE WHEN p_patch ? 'business_license_file_id' THEN (p_patch->>'business_license_file_id')::uuid ELSE application.business_license_file_id END,
      admin_name = CASE WHEN p_patch ? 'admin_name' THEN p_patch->>'admin_name' ELSE application.admin_name END,
      address_province = CASE WHEN p_patch ? 'address_province' THEN p_patch->>'address_province' ELSE application.address_province END,
      address_city = CASE WHEN p_patch ? 'address_city' THEN p_patch->>'address_city' ELSE application.address_city END,
      address_district = CASE WHEN p_patch ? 'address_district' THEN p_patch->>'address_district' ELSE application.address_district END,
      address_region_code = CASE WHEN p_patch ? 'address_region_code' THEN p_patch->>'address_region_code' ELSE application.address_region_code END,
      address = CASE WHEN p_patch ? 'address' THEN p_patch->>'address' ELSE application.address END,
      address_latitude = CASE WHEN p_patch ? 'address_latitude' THEN (p_patch->>'address_latitude')::double precision ELSE application.address_latitude END,
      address_longitude = CASE WHEN p_patch ? 'address_longitude' THEN (p_patch->>'address_longitude')::double precision ELSE application.address_longitude END,
      service_region_codes = CASE WHEN p_patch ? 'service_region_codes' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'service_region_codes')) ELSE application.service_region_codes END,
      candidate_partner_id = CASE WHEN p_replace_candidate THEN p_candidate_partner_id ELSE application.candidate_partner_id END,
      candidate_match_reason = CASE WHEN p_replace_candidate THEN p_candidate_match_reason ELSE application.candidate_match_reason END,
      candidate_snapshot = CASE WHEN p_replace_candidate THEN COALESCE(p_candidate_snapshot, '{}'::jsonb) ELSE application.candidate_snapshot END,
      partner_assist_status = CASE WHEN p_replace_candidate THEN p_partner_assist_status ELSE application.partner_assist_status END,
      partner_assist_requested_at = CASE WHEN p_replace_candidate THEN p_partner_assist_requested_at ELSE application.partner_assist_requested_at END,
      partner_assist_due_at = CASE WHEN p_replace_candidate THEN p_partner_assist_due_at ELSE application.partner_assist_due_at END,
      status = 'submitted', version = p_expected_version + 1
  WHERE id = p_application_id
  RETURNING application.id, application.status,
    application.partner_assist_status, application.version
  INTO v_after_id, v_after_status, v_after_assist_status, v_after_version;

  INSERT INTO public.tenant_onboarding_application_reviews (
    application_id, review_stage, decision, actor_type, actor_visitor_id,
    before_status, after_status, before_partner_assist_status,
    after_partner_assist_status, required_fields, remark, metadata
  ) VALUES (
    p_application_id, 'applicant', 'supplemented', 'visitor', p_visitor_id,
    v_before_status, v_after_status, v_before_assist_status,
    v_after_assist_status, '{}'::text[], NULL,
    jsonb_build_object('version', v_after_version, 'mutated_at', p_now)
  );

  RETURN QUERY SELECT v_after_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_tenant_onboarding_application(
  p_application_id uuid,
  p_visitor_id text,
  p_expected_version integer,
  p_reason text,
  p_now timestamptz
)
RETURNS TABLE(application_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_before_status text;
  v_before_assist_status text;
  v_after_id uuid;
  v_after_status text;
  v_after_assist_status text;
  v_after_version integer;
BEGIN
  SELECT application.status, application.partner_assist_status
  INTO v_before_status, v_before_assist_status
  FROM public.tenant_onboarding_applications AS application
  WHERE application.id = p_application_id
    AND application.visitor_id = p_visitor_id
    AND application.status IN ('submitted', 'reviewing', 'supplement_required')
    AND application.version = p_expected_version
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.tenant_onboarding_applications AS application
  SET status = 'withdrawn', version = p_expected_version + 1,
      withdrawn_at = p_now
  WHERE id = p_application_id
  RETURNING application.id, application.status,
    application.partner_assist_status, application.version
  INTO v_after_id, v_after_status, v_after_assist_status, v_after_version;

  INSERT INTO public.tenant_onboarding_application_reviews (
    application_id, review_stage, decision, actor_type, actor_visitor_id,
    before_status, after_status, before_partner_assist_status,
    after_partner_assist_status, required_fields, remark, metadata
  ) VALUES (
    p_application_id, 'applicant', 'withdrawn', 'visitor', p_visitor_id,
    v_before_status, v_after_status, v_before_assist_status,
    v_after_assist_status, '{}'::text[], NULLIF(btrim(p_reason), ''),
    jsonb_build_object('version', v_after_version, 'mutated_at', p_now)
  );

  RETURN QUERY SELECT v_after_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_tenant_onboarding_application(jsonb, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tenant_onboarding_application(jsonb, uuid, text, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.supplement_tenant_onboarding_application(uuid, text, integer, jsonb, boolean, uuid, text, jsonb, text, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplement_tenant_onboarding_application(uuid, text, integer, jsonb, boolean, uuid, text, jsonb, text, timestamptz, timestamptz, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.withdraw_tenant_onboarding_application(uuid, text, integer, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_tenant_onboarding_application(uuid, text, integer, text, timestamptz) TO service_role;

COMMIT;
