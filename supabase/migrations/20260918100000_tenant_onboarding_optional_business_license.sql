-- Allow applicants to submit and supplement tenant onboarding applications
-- without a business-license document. Rollback requires proving no application
-- has a NULL business_license_file_id before restoring NOT NULL, then restoring
-- the previous RPC definitions.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '1min';

ALTER TABLE public.tenant_onboarding_applications
  ALTER COLUMN business_license_file_id DROP NOT NULL;

COMMENT ON COLUMN public.tenant_onboarding_applications.business_license_file_id IS
  'Optional private business-license file supplied by the tenant onboarding applicant.';

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
  v_share_link public.tenant_onboarding_share_links%ROWTYPE;
  v_allowed_keys constant text[] := ARRAY[
    'application_no', 'visitor_id', 'visitor_context_id', 'company_name',
    'unified_social_credit_code', 'business_license_file_id', 'admin_name',
    'admin_phone', 'address_province', 'address_city', 'address_district',
    'address_region_code', 'address', 'address_latitude', 'address_longitude',
    'service_region_codes', 'source_channel', 'invite_code_id',
    'candidate_partner_id', 'candidate_match_reason', 'candidate_snapshot',
    'partner_assist_status', 'partner_assist_requested_at',
    'partner_assist_due_at', 'privacy_policy_version',
    'onboarding_terms_version', 'consented_at', 'idempotency_key',
    'share_token'
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

  IF NULLIF(btrim(p_application->>'share_token'), '') IS NOT NULL THEN
    SELECT share_link.*
    INTO v_share_link
    FROM public.tenant_onboarding_share_links AS share_link
    WHERE share_link.share_token = p_application->>'share_token'
      AND share_link.scene = 'tenant_onboarding'
      AND share_link.status = 'active'
      AND share_link.expires_at > p_now
    FOR UPDATE;
  END IF;

  PERFORM context.id
  FROM public.user_location_contexts AS context
  WHERE context.id = (p_application->>'visitor_context_id')::uuid
    AND context.visitor_id = p_application->>'visitor_id'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TENANT_ONBOARDING_CONTEXT_FORBIDDEN';
  END IF;

  IF NULLIF(pg_catalog.btrim(p_application->>'business_license_file_id'), '')::uuid IS NOT NULL THEN
    PERFORM file.id
    FROM public.platform_file_objects AS file
    WHERE file.id = NULLIF(pg_catalog.btrim(p_application->>'business_license_file_id'), '')::uuid
      AND file.owner_type = 'visitor'
      AND file.owner_visitor_id = p_application->>'visitor_id'
      AND file.scene = 'tenant_onboarding_license'
      AND file.status = 'active'
      AND file.visibility = 'private'
      AND file.deleted_at IS NULL
      AND file.public_url IS NULL
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'TENANT_ONBOARDING_DOCUMENT_FORBIDDEN';
    END IF;
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
      consented_at, idempotency_key, share_link_id, referred_by_user_id,
      referred_by_openid, referred_by_employee_id, referral_source
    ) VALUES (
      p_application->>'application_no',
      p_application->>'visitor_id',
      NULLIF(p_application->>'visitor_context_id', '')::uuid,
      p_application->>'company_name',
      NULLIF(p_application->>'unified_social_credit_code', ''),
      NULLIF(pg_catalog.btrim(p_application->>'business_license_file_id'), '')::uuid,
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
      p_application->>'idempotency_key',
      v_share_link.id,
      v_share_link.sharer_user_id,
      v_share_link.sharer_openid,
      v_share_link.sharer_employee_id,
      CASE WHEN v_share_link.id IS NULL THEN NULL ELSE 'tenant_onboarding_share' END
    )
    RETURNING id INTO v_application_id;

    IF v_share_link.id IS NOT NULL THEN
      UPDATE public.tenant_onboarding_share_links AS share_link
      SET
        submitted_count = share_link.submitted_count + 1,
        updated_at = p_now
      WHERE share_link.id = v_share_link.id;
    END IF;
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

  IF p_patch ? 'business_license_file_id'
    AND NULLIF(pg_catalog.btrim(p_patch->>'business_license_file_id'), '')::uuid IS NOT NULL
  THEN
    PERFORM file.id
    FROM public.platform_file_objects AS file
    WHERE file.id = NULLIF(pg_catalog.btrim(p_patch->>'business_license_file_id'), '')::uuid
      AND file.owner_type = 'visitor'
      AND file.owner_visitor_id = p_visitor_id
      AND file.scene = 'tenant_onboarding_license'
      AND file.status = 'active'
      AND file.visibility = 'private'
      AND file.deleted_at IS NULL
      AND file.public_url IS NULL
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'TENANT_ONBOARDING_DOCUMENT_FORBIDDEN';
    END IF;
  END IF;

  UPDATE public.tenant_onboarding_applications AS application
  SET company_name = CASE WHEN p_patch ? 'company_name' THEN p_patch->>'company_name' ELSE application.company_name END,
      unified_social_credit_code = CASE WHEN p_patch ? 'unified_social_credit_code' THEN p_patch->>'unified_social_credit_code' ELSE application.unified_social_credit_code END,
      business_license_file_id = CASE
        WHEN p_patch ? 'business_license_file_id'
          THEN NULLIF(pg_catalog.btrim(p_patch->>'business_license_file_id'), '')::uuid
        ELSE application.business_license_file_id
      END,
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

REVOKE ALL ON FUNCTION public.submit_tenant_onboarding_application(
  jsonb, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tenant_onboarding_application(
  jsonb, uuid, text, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.supplement_tenant_onboarding_application(
  uuid, text, integer, jsonb, boolean, uuid, text, jsonb, text,
  timestamptz, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplement_tenant_onboarding_application(
  uuid, text, integer, jsonb, boolean, uuid, text, jsonb, text,
  timestamptz, timestamptz, timestamptz
) TO service_role;

COMMIT;
