-- Keep partner assist decisions and append-only review events atomic. The
-- expiry function is replaced with a bounded batch so request-time cleanup
-- cannot scan or lock an unbounded queue. Rollback by restoring the previous
-- expiry function and revoking/dropping the decision function; application and
-- review rows are business history and must not be deleted.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_tenant_onboarding_partner_assist(
  p_application_id uuid,
  p_partner_id uuid,
  p_partner_member_id uuid,
  p_decision text,
  p_remark text,
  p_expected_version integer,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_application public.tenant_onboarding_applications%ROWTYPE;
  v_after public.tenant_onboarding_applications%ROWTYPE;
  v_remark text;
BEGIN
  IF p_application_id IS NULL
    OR p_partner_id IS NULL
    OR p_partner_member_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_now IS NULL
    OR p_decision IS NULL
    OR p_decision NOT IN ('verified', 'supplement_suggested', 'not_recommended')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_ONBOARDING_PARTNER_ASSIST_INPUT_INVALID';
  END IF;

  v_remark := NULLIF(pg_catalog.btrim(COALESCE(p_remark, '')), '');
  IF v_remark IS NOT NULL AND pg_catalog.length(v_remark) > 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_ONBOARDING_PARTNER_ASSIST_INPUT_INVALID';
  END IF;

  SELECT application.*
  INTO v_application
  FROM public.tenant_onboarding_applications AS application
  WHERE application.id = p_application_id
    AND application.candidate_partner_id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'application_not_found');
  END IF;

  -- Keep the same application -> partner lock order as platform approval.
  -- A concurrent partner suspension must commit before this status recheck or
  -- wait until the assist decision and its review event have committed.
  PERFORM 1
  FROM public.platform_partners AS partner
  WHERE partner.id = p_partner_id
    AND partner.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'state_conflict');
  END IF;

  PERFORM 1
  FROM public.platform_partner_members AS member
  WHERE member.id = p_partner_member_id
    AND member.partner_id = p_partner_id
    AND member.status = 'active'
    AND member.auth_user_id IS NOT NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'state_conflict');
  END IF;

  IF v_application.partner_assist_status <> 'pending'
    OR v_application.status NOT IN (
      'submitted',
      'reviewing',
      'supplement_required'
    )
    OR v_application.partner_assist_due_at IS NULL
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'state_conflict');
  END IF;

  -- The bounded queue cleanup may have processed an earlier batch. Expire this
  -- already locked task in the same transaction so cutoff behavior is exact.
  IF v_application.partner_assist_due_at <= p_now THEN
    UPDATE public.tenant_onboarding_applications AS application
    SET
      partner_assist_status = 'expired',
      version = application.version + 1,
      updated_at = p_now
    WHERE application.id = v_application.id
      AND application.candidate_partner_id = p_partner_id
      AND application.partner_assist_status = 'pending'
      AND application.status IN (
        'submitted',
        'reviewing',
        'supplement_required'
      )
      AND application.partner_assist_due_at <= p_now
    RETURNING application.* INTO v_after;

    IF FOUND THEN
      INSERT INTO public.tenant_onboarding_application_reviews (
        application_id,
        review_stage,
        decision,
        actor_type,
        before_status,
        after_status,
        before_partner_assist_status,
        after_partner_assist_status,
        metadata
      )
      VALUES (
        v_application.id,
        'partner_assist',
        'expired',
        'system',
        v_application.status,
        v_application.status,
        'pending',
        'expired',
        pg_catalog.jsonb_build_object('cutoff', p_now)
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object('status', 'state_conflict');
  END IF;

  IF v_application.version IS DISTINCT FROM p_expected_version THEN
    RETURN pg_catalog.jsonb_build_object('status', 'version_conflict');
  END IF;

  UPDATE public.tenant_onboarding_applications AS application
  SET
    partner_assist_status = p_decision,
    version = application.version + 1,
    updated_at = p_now
  WHERE application.id = v_application.id
    AND application.candidate_partner_id = p_partner_id
    AND application.partner_assist_status = 'pending'
    AND application.status IN (
      'submitted',
      'reviewing',
      'supplement_required'
    )
    AND application.partner_assist_due_at > p_now
    AND application.version = p_expected_version
  RETURNING application.* INTO v_after;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'state_conflict');
  END IF;

  INSERT INTO public.tenant_onboarding_application_reviews (
    application_id,
    review_stage,
    decision,
    actor_type,
    actor_partner_member_id,
    before_status,
    after_status,
    before_partner_assist_status,
    after_partner_assist_status,
    remark,
    metadata
  )
  VALUES (
    v_application.id,
    'partner_assist',
    p_decision,
    'partner_member',
    p_partner_member_id,
    v_application.status,
    v_application.status,
    'pending',
    p_decision,
    v_remark,
    pg_catalog.jsonb_build_object(
      'partner_id', p_partner_id,
      'before_version', v_application.version,
      'after_version', v_after.version
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'status', 'updated',
    'task', pg_catalog.jsonb_build_object(
      'id', v_after.id,
      'company_name', v_after.company_name,
      'admin_phone', v_after.admin_phone,
      'address_city', v_after.address_city,
      'address_district', v_after.address_district,
      'service_region_codes', v_after.service_region_codes,
      'partner_assist_status', v_after.partner_assist_status,
      'partner_assist_requested_at', v_after.partner_assist_requested_at,
      'partner_assist_due_at', v_after.partner_assist_due_at,
      'version', v_after.version,
      'created_at', v_after.created_at,
      'updated_at', v_after.updated_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_tenant_onboarding_partner_assist(
  uuid,
  uuid,
  uuid,
  text,
  text,
  integer,
  timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_tenant_onboarding_partner_assist(
  uuid,
  uuid,
  uuid,
  text,
  text,
  integer,
  timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.submit_tenant_onboarding_partner_assist(
  uuid,
  uuid,
  uuid,
  text,
  text,
  integer,
  timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tenant_onboarding_partner_assist(
  uuid,
  uuid,
  uuid,
  text,
  text,
  integer,
  timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_tenant_onboarding_partner_assists(
  p_cutoff timestamptz,
  p_partner_id uuid DEFAULT NULL
)
RETURNS TABLE(application_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_cutoff IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_ONBOARDING_PARTNER_ASSIST_CUTOFF_REQUIRED';
  END IF;

  RETURN QUERY
  WITH due_applications AS MATERIALIZED (
    SELECT applications.id
    FROM public.tenant_onboarding_applications AS applications
    WHERE applications.partner_assist_status = 'pending'
      AND applications.partner_assist_due_at IS NOT NULL
      AND applications.partner_assist_due_at <= p_cutoff
      AND applications.status IN (
        'submitted',
        'reviewing',
        'supplement_required'
      )
      AND (
        p_partner_id IS NULL
        OR applications.candidate_partner_id = p_partner_id
      )
    ORDER BY applications.partner_assist_due_at ASC, applications.id ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  ),
  expired_applications AS (
    UPDATE public.tenant_onboarding_applications AS applications
    SET
      partner_assist_status = 'expired',
      version = applications.version + 1,
      updated_at = pg_catalog.now()
    FROM due_applications
    WHERE applications.id = due_applications.id
      AND applications.partner_assist_status = 'pending'
      AND applications.status IN (
        'submitted',
        'reviewing',
        'supplement_required'
      )
    RETURNING applications.id, applications.status
  ),
  inserted_reviews AS (
    INSERT INTO public.tenant_onboarding_application_reviews (
      application_id,
      review_stage,
      decision,
      actor_type,
      before_status,
      after_status,
      before_partner_assist_status,
      after_partner_assist_status,
      metadata
    )
    SELECT
      expired_applications.id,
      'partner_assist',
      'expired',
      'system',
      expired_applications.status,
      expired_applications.status,
      'pending',
      'expired',
      pg_catalog.jsonb_build_object('cutoff', p_cutoff)
    FROM expired_applications
    RETURNING tenant_onboarding_application_reviews.application_id
  )
  SELECT inserted_reviews.application_id
  FROM inserted_reviews;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_tenant_onboarding_partner_assists(
  timestamptz,
  uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_tenant_onboarding_partner_assists(
  timestamptz,
  uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.expire_tenant_onboarding_partner_assists(
  timestamptz,
  uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_tenant_onboarding_partner_assists(
  timestamptz,
  uuid
) TO service_role;

COMMIT;
